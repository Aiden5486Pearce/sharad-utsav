import { describe, expect, it } from "vitest";
import { bracketForAge, isValidAge } from "@/domain/age";
import { quoteCart } from "@/domain/quote";
import { bookingRequestSchema, quoteRequestSchema } from "@/server/schemas";
import { cart, D, dayPass, NOW, person } from "./helpers";

describe("age brackets (boundaries)", () => {
  it.each([
    [0, "toddler"], [4, "toddler"], [5, "child"], [11, "child"], [12, "adult"], [17, "adult"], [18, "adult"], [120, "adult"],
  ] as const)("age %i is %s", (age, bracket) => expect(bracketForAge(age)).toBe(bracket));

  it.each([-1, 3.5, 121, NaN, Infinity])("%s is not a valid age", (age) => expect(isValidAge(age)).toBe(false));
});

describe("age rules on the server", () => {
  const adult = person(30, dayPass(D.d10));
  const issueCodes = (c: ReturnType<typeof cart>) => {
    const r = quoteCart(c, NOW);
    return r.ok ? [] : r.issues.map((i) => i.code);
  };

  it("booker must be 18+", () => {
    expect(issueCodes(cart([person(17, dayPass(D.d10))]))).toContain("BOOKER_UNDER_18");
    expect(issueCodes(cart([person(18, dayPass(D.d10))]))).toEqual([]);
  });

  it("an under-5 can't hold a ticket", () => {
    expect(issueCodes(cart([adult, person(4, dayPass(D.d10))]))).toContain("UNDER_5_NEEDS_NO_TICKET");
  });

  it("an adult-age guest is priced as adult, a 7-year-old can never get the adult product", () => {
    const r = quoteCart(cart([adult, person(7, dayPass(D.d10))]), NOW);
    expect(r.ok && r.quote.lines.map((l) => l.productId)).toEqual(["dayAdult", "dayChild"]);
  });

  it("age 11 is child, age 12 is adult (the cut-off)", () => {
    const r = quoteCart(cart([adult, person(11, dayPass(D.d10)), person(12, dayPass(D.d10))]), NOW);
    expect(r.ok && r.quote.lines.map((l) => [l.productId, l.quantity])).toEqual([["dayAdult", 2], ["dayChild", 1]]);
  });
});

describe("nonsense in the age field is rejected before any rule runs", () => {
  const base = { guests: [], toddlers: 0, toddlerDinnerDays: [] as const, dandiyaPairs: 0, promoCode: null };
  const body = (age: unknown) => ({ ...base, booker: { age, ticket: { kind: "allDays" }, dinnerDays: [], workshopDays: [] } });

  it.each([-5, 7.5, 999, "7", null, "abc", Number.MAX_SAFE_INTEGER])("rejects %s", (age) => {
    expect(quoteRequestSchema.safeParse(body(age)).success).toBe(false);
  });
  it("accepts a normal age", () => expect(quoteRequestSchema.safeParse(body(34)).success).toBe(true));
  it("booking schema also rejects a client that tries to smuggle a price", () => {
    const parsed = bookingRequestSchema.safeParse({ priceCents: 1, total: 1 });
    expect(parsed.success).toBe(false);
  });
});
