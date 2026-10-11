import { describe, expect, it } from "vitest";
import { createBooking, type BookingDeps } from "@/server/bookingService";
import type { BookingRequest } from "@/server/schemas";
import { MemoryStore } from "@/server/store/memory";
import type { Charge } from "@/server/payment";
import { D, NOW } from "./helpers";

let counter = 0;
const okCharge: Charge = async () => ({ ok: true, paymentRef: "sim_ok" });
const deps = (store: MemoryStore, charge: Charge = okCharge): BookingDeps => ({ store, charge, now: () => NOW, newRef: () => `SU26-TEST${++counter}` });

const contact = { email: "a@b.com", phone: "214 555 0123" };
function request(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    idempotencyKey: `key-${"x".repeat(12)}-${++counter}`,
    expectedTotalCents: 1500,
    booker: { firstName: "Asha", lastName: "Patel", age: 35, ticket: { kind: "day", days: [D.d10] }, dinnerDays: [], workshopDays: [], ...contact },
    guests: [], toddlers: 0, toddlerDinnerDays: [], dandiyaPairs: 0, promoCode: null, payment: { scenario: "success" },
    ...overrides,
  };
}
const workshopFor = (n: number): BookingRequest => request({
  expectedTotalCents: 1500 * Math.max(1, n) + 2000 * n,
  booker: { firstName: "A", lastName: "B", age: 35, ticket: { kind: "day", days: [D.d11] }, dinnerDays: [], workshopDays: n >= 1 ? [D.d11] : [], ...contact },
  guests: n >= 2 ? [{ firstName: "C", lastName: "D", age: 30, ticket: { kind: "day", days: [D.d11] }, dinnerDays: [], workshopDays: [D.d11] }] : [],
});

describe("server owns the price", () => {
  it("rejects a stale/edited total and charges nothing", async () => {
    const store = new MemoryStore();
    const out = await createBooking(request({ expectedTotalCents: 1 }), deps(store));
    expect(out).toMatchObject({ ok: false, error: { code: "PRICE_CHANGED" } });
    expect((await store.getStock()).dayAdult).toBe(380);
  });
  it("stores the server's total", async () => {
    const out = await createBooking(request(), deps(new MemoryStore()));
    expect(out.ok && out.booking.totalCents).toBe(1500);
  });
  it("rejects rule-breaking requests that skip the UI (adult booker age 10)", async () => {
    const bad = request();
    bad.booker.age = 10;
    expect(await createBooking(bad, deps(new MemoryStore()))).toMatchObject({ ok: false, error: { code: "RULE_VIOLATION" } });
  });
  it("rejects an invalid promo instead of silently charging full price", async () => {
    expect(await createBooking(request({ promoCode: "EXPIRED5" }), deps(new MemoryStore()))).toMatchObject({ ok: false, error: { code: "PROMO_REJECTED" } });
  });
});

describe("stock is real", () => {
  it("a booking reduces stock", async () => {
    const store = new MemoryStore();
    await createBooking(request(), deps(store));
    expect((await store.getStock()).dayAdult).toBe(379);
  });
  it("two people booking the last two workshop places at once: exactly one wins", async () => {
    const store = new MemoryStore();
    const [a, b] = await Promise.all([createBooking(workshopFor(2), deps(store)), createBooking(workshopFor(2), deps(store))]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect((await store.getStock()).garba).toBe(0);
  });
  it("a sold-out item blocks the whole booking and takes nothing", async () => {
    const store = new MemoryStore();
    await createBooking(workshopFor(2), deps(store));
    const out = await createBooking(workshopFor(1), deps(store));
    expect(out).toMatchObject({ ok: false, error: { code: "SOLD_OUT" } });
    expect((await store.getStock()).dayAdult).toBe(378); // only the first booking (2 adults) took stock
  });
  it("sold-out All-Day Adult can't be bought even by calling the API directly", async () => {
    const out = await createBooking(request({ expectedTotalCents: 6000, booker: { ...request().booker, ticket: { kind: "allDays" } } }), deps(new MemoryStore()));
    expect(out).toMatchObject({ ok: false, error: { code: "SOLD_OUT", shortages: [{ productId: "allDayAdult", available: 0 }] } });
  });
});

describe("double clicks and payment failure", () => {
  it("same idempotency key twice → one booking, one stock decrement", async () => {
    const store = new MemoryStore();
    const req = request();
    const [a, b] = await Promise.all([createBooking(req, deps(store)), createBooking(req, deps(store))]);
    const results = [a, b];
    expect(results.filter((r) => r.ok).length).toBeGreaterThanOrEqual(1);
    const again = await createBooking(req, deps(store));
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect((await store.getStock()).dayAdult).toBe(379);
  });
  it("declined card gives the stock back and allows a retry with the same key", async () => {
    const store = new MemoryStore();
    const req = request({ payment: { scenario: "decline" } });
    const declined: Charge = async () => ({ ok: false, message: "declined" });
    expect(await createBooking(req, deps(store, declined))).toMatchObject({ ok: false, error: { code: "PAYMENT_DECLINED" } });
    expect((await store.getStock()).dayAdult).toBe(380);
    expect(await createBooking(req, deps(store))).toMatchObject({ ok: true });
    expect((await store.getStock()).dayAdult).toBe(379);
  });
  it("a payment service crash also gives the stock back", async () => {
    const store = new MemoryStore();
    const boom: Charge = async () => { throw new Error("network"); };
    expect(await createBooking(request(), deps(store, boom))).toMatchObject({ ok: false, error: { code: "SERVER_ERROR" } });
    expect((await store.getStock()).dayAdult).toBe(380);
  });
});

describe("promo use counters and pending holds", () => {
  it("decrements a limited promo on success and blocks the next use at 0", async () => {
    const store = new MemoryStore();
    store.seedPromoUses("MAXEDOUT", 1);
    const req = request({
      promoCode: "MAXEDOUT",
      expectedTotalCents: 1350, // 1500 - 10%
    });
    expect(await createBooking(req, deps(store))).toMatchObject({ ok: true });
    expect(await store.getPromoRemaining("MAXEDOUT")).toBe(0);
    const again = request({ promoCode: "MAXEDOUT", expectedTotalCents: 1350 });
    expect(await createBooking(again, deps(store))).toMatchObject({ ok: false, error: { code: "PROMO_REJECTED" } });
  });
  it("releases stock held by a pending booking after the hold TTL", async () => {
    const store = new MemoryStore();
    const booking = {
      ref: "SU26-HOLDTEST1",
      status: "pending" as const,
      idempotencyKey: "hold-key-1234567890",
      createdAt: new Date().toISOString(),
      contact: { firstName: "A", lastName: "B", email: "a@b.com", phone: "214 555 0123" },
      people: [{ firstName: "A", lastName: "B", age: 35, ticket: { kind: "day" as const, days: [D.d10] }, dinnerDays: [], workshopDays: [] }],
      toddlers: 0,
      toddlerDinnerDays: [] as typeof D.d10[],
      dandiyaPairs: 0,
      lines: [{ productId: "dayAdult" as const, label: "Day Pass – Adult", quantity: 1, unitCents: 1500, totalCents: 1500 }],
      promoCode: null,
      subtotalCents: 1500,
      discountCents: 0,
      totalCents: 1500,
      paymentRef: null,
    };
    const commit = await store.commit(booking, { dayAdult: 1 }, Date.now() + 1000);
    expect(commit.status).toBe("committed");
    expect((await store.getStock()).dayAdult).toBe(379);
    expect(await store.sweepExpiredHolds(Date.now() + 60_000)).toBe(1);
    expect((await store.getStock()).dayAdult).toBe(380);
    expect(await store.getBooking(booking.ref)).toBeNull();
  });
});
