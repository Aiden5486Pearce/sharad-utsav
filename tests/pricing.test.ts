import { describe, expect, it } from "vitest";
import { formatCents, percentOf } from "@/domain/money";
import { quoteCart } from "@/domain/quote";
import type { Cart } from "@/domain/types";
import { cart, D, dayPass, NOW, person } from "./helpers";

const total = (c: Cart) => {
  const r = quoteCart(c, NOW);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.quote;
};

describe("entry tickets", () => {
  it("adult day pass is $15 per day", () => expect(total(cart([person(30, dayPass(D.d10, D.d11, D.d12))])).totalCents).toBe(4500));
  it("child day pass is $8 per day", () => expect(total(cart([person(30, dayPass(D.d10)), person(8, dayPass(D.d10, D.d11))])).totalCents).toBe(1500 + 1600));
  it("all-day child is a flat $30", () => expect(total(cart([person(30, dayPass(D.d10)), person(8, { kind: "allDays" })])).totalCents).toBe(1500 + 3000));
  it("family pass is one flat $40 for the group", () => {
    const t = total(cart([
      person(40, { kind: "family", group: 1, day: D.d12 }), person(38, { kind: "family", group: 1, day: D.d12 }),
      person(9, { kind: "family", group: 1, day: D.d12 }), person(6, { kind: "family", group: 1, day: D.d12 }),
    ]));
    expect(t.totalCents).toBe(4000);
    expect(t.lines).toHaveLength(1);
  });
  it("two family groups cost $80", () => {
    const t = total(cart([
      person(40, { kind: "family", group: 1, day: D.d12 }), person(9, { kind: "family", group: 1, day: D.d12 }),
      person(35, { kind: "family", group: 2, day: D.d13 }), person(8, { kind: "family", group: 2, day: D.d13 }),
    ]));
    expect(t.totalCents).toBe(8000);
  });
  it("toddlers are free and add nothing", () => expect(total(cart([person(30, dayPass(D.d10))], { toddlers: 3 })).totalCents).toBe(1500));
  it("toddler dinner plates are charged per toddler per day", () => {
    const t = total(cart([person(30, dayPass(D.d10, D.d11))], { toddlers: 2, toddlerDinnerDays: [D.d10, D.d11] }));
    expect(t.totalCents).toBe(3000 + 2 * 2 * 1200);
  });
  it("toddler dinner on a day nobody attends is refused", () => {
    expect(quoteCart(cart([person(30, dayPass(D.d10))], { toddlers: 1, toddlerDinnerDays: [D.d11] }), NOW).ok).toBe(false);
  });
});

describe("extras", () => {
  it("dinner is per person per day, workshop $20 each, sticks $5 a pair", () => {
    const t = total(cart(
      [person(30, dayPass(D.d11, D.d12), { dinnerDays: [D.d11, D.d12], workshopDays: [D.d11] }), person(9, dayPass(D.d11), { dinnerDays: [D.d11] })],
      { dandiyaPairs: 4 },
    ));
    // tickets 30 + 8 = 3800 ... adult 2 days = 3000, child 1 day = 800
    expect(t.subtotalCents).toBe(3000 + 800 + 3 * 1200 + 2000 + 4 * 500);
  });
  it("workshop on a day that is not 11/13 is refused", () => {
    expect(quoteCart(cart([person(30, dayPass(D.d12), { workshopDays: [D.d12] })]), NOW).ok).toBe(false);
  });
  it("workshop on a day the person is not attending is refused", () => {
    expect(quoteCart(cart([person(30, dayPass(D.d12), { workshopDays: [D.d11] })]), NOW).ok).toBe(false);
  });
  it("dinner on a day the person is not attending is refused", () => {
    expect(quoteCart(cart([person(30, dayPass(D.d12), { dinnerDays: [D.d10] })]), NOW).ok).toBe(false);
  });
});

describe("promo codes", () => {
  const base = () => cart([person(30, dayPass(D.d10, D.d11)), person(9, dayPass(D.d10, D.d11))]); // 3000 + 1600 = 4600
  const withCode = (code: string | null) => total({ ...base(), promoCode: code });

  it("SEVA10 takes 10% off the whole booking (extras included)", () => {
    expect(withCode("SEVA10").totalCents).toBe(4600 - 460);
    const c = cart([person(30, dayPass(D.d11), { dinnerDays: [D.d11] })], { promoCode: "SEVA10" });
    expect(total(c).discountCents).toBe(270);
  });
  it("FLAT20 takes $20 off", () => expect(withCode("FLAT20").totalCents).toBe(2600));
  it("FLAT20 never takes the total below $0", () => {
    const t = total(cart([person(30, dayPass(D.d10))], { promoCode: "FLAT20" }));
    expect(t.discountCents).toBe(1500);
    expect(t.totalCents).toBe(0);
  });
  it("KIDSFREE zeroes child tickets only", () => expect(withCode("KIDSFREE").totalCents).toBe(3000));
  it("KIDSFREE does not touch child DINNERS", () => {
    const t = total(cart([person(30, dayPass(D.d10)), person(9, dayPass(D.d10), { dinnerDays: [D.d10] })], { promoCode: "KIDSFREE" }));
    expect(t.totalCents).toBe(1500 + 1200);
  });
  it("KIDSFREE with no children is rejected with a helpful reason", () => {
    const t = total(cart([person(30, dayPass(D.d10))], { promoCode: "KIDSFREE" }));
    expect(t.promo).toMatchObject({ status: "rejected", reason: "NOT_APPLICABLE" });
    expect(t.totalCents).toBe(1500);
  });
  it("EXPIRED5 is rejected as expired", () => expect(withCode("EXPIRED5").promo).toMatchObject({ status: "rejected", reason: "EXPIRED" }));
  it("MAXEDOUT is rejected as used up", () => expect(withCode("MAXEDOUT").promo).toMatchObject({ status: "rejected", reason: "MAXED_OUT" }));
  it("unknown codes are rejected", () => expect(withCode("HELLO").promo).toMatchObject({ status: "rejected", reason: "UNKNOWN" }));
  it("codes are case/space insensitive", () => expect(withCode("  seva10 ").promo).toMatchObject({ status: "applied", code: "SEVA10" }));
  it("blank code means no code", () => expect(withCode("   ").promo).toEqual({ status: "none" }));
  it("an expired/invalid code never discounts", () => expect(withCode("EXPIRED5").totalCents).toBe(4600));
});

describe("money is integer cents", () => {
  it("rounds half up in whole cents", () => {
    expect(percentOf(1675, 10)).toBe(168); // 167.5 -> 168
    expect(percentOf(1674, 10)).toBe(167);
  });
  it("never produces fractional cents", () => {
    for (const code of ["SEVA10", "FLAT20", "KIDSFREE"]) {
      const t = total(cart([person(30, dayPass(D.d10, D.d11, D.d12)), person(7, dayPass(D.d10), { dinnerDays: [D.d10] })], { promoCode: code, dandiyaPairs: 3 }));
      for (const n of [t.subtotalCents, t.discountCents, t.totalCents, ...t.lines.map((l) => l.totalCents)]) expect(Number.isInteger(n)).toBe(true);
    }
  });
  it("formats cents", () => {
    expect(formatCents(14670)).toBe("$146.70");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(0)).toBe("$0.00");
  });
});
