import { forEachProduct, isLimitedPromo, limitedPromoInitialUses, PRODUCTS, PROMOS } from "@/domain/catalog";
import { demandEntries, type Demand } from "@/domain/pricing";
import { normalisePromoCode } from "@/domain/promo";
import type { Booking } from "../schemas";
import { demandFromBooking, type BookingStore, type CommitResult, type Shortage, type StockLevels } from "./types";

/**
 * In-memory store for local development and tests. NOT valid on Vercel: every serverless
 * instance would have its own copy of the stock. JS is single-threaded and commit() has no
 * `await` inside, so it is atomic within one process.
 */
export class MemoryStore implements BookingStore {
  private stock: StockLevels = forEachProduct((id) => PRODUCTS[id].initialStock);
  private bookings = new Map<string, Booking>();
  private byKey = new Map<string, string>();
  private holds = new Map<string, number>(); // ref → expiry ms
  private promoRemaining = new Map<string, number>();
  private rate = new Map<string, { resetAt: number; count: number }>();

  constructor() {
    for (const promo of PROMOS.values()) {
      if (promo.usesRemaining !== null) this.promoRemaining.set(promo.code, promo.usesRemaining);
    }
  }

  /** Test helper: set remaining uses for a limited promo (e.g. give MAXEDOUT one life). */
  seedPromoUses(code: string, remaining: number): void {
    this.promoRemaining.set(normalisePromoCode(code), remaining);
  }

  async getStock(): Promise<StockLevels> {
    await this.sweepExpiredHolds(Date.now());
    return { ...this.stock };
  }

  async getPromoRemaining(code: string): Promise<number | null> {
    const normalised = normalisePromoCode(code);
    if (!isLimitedPromo(normalised)) return null;
    return this.promoRemaining.get(normalised) ?? limitedPromoInitialUses(normalised) ?? 0;
  }

  async commit(booking: Booking, demand: Demand, holdUntilMs: number): Promise<CommitResult> {
    await this.sweepExpiredHolds(Date.now());

    const existingRef = this.byKey.get(booking.idempotencyKey);
    const existing = existingRef ? this.bookings.get(existingRef) : undefined;
    if (existing) return { status: "duplicate", booking: existing };

    if (booking.promoCode && isLimitedPromo(booking.promoCode)) {
      const left = await this.getPromoRemaining(booking.promoCode);
      if (left === null || left <= 0) return { status: "promo_exhausted" };
    }

    const entries = demandEntries(demand);
    const shortages: Shortage[] = entries
      .filter(([id, qty]) => this.stock[id] < qty)
      .map(([id, qty]) => ({ productId: id, requested: qty, available: this.stock[id] }));
    if (shortages.length > 0) return { status: "insufficient", shortages };

    for (const [id, qty] of entries) this.stock[id] -= qty;
    if (booking.promoCode && isLimitedPromo(booking.promoCode)) {
      const code = normalisePromoCode(booking.promoCode);
      this.promoRemaining.set(code, (this.promoRemaining.get(code) ?? 0) - 1);
    }
    this.bookings.set(booking.ref, booking);
    this.byKey.set(booking.idempotencyKey, booking.ref);
    this.holds.set(booking.ref, holdUntilMs);
    return { status: "committed" };
  }

  async markConfirmed(booking: Booking): Promise<void> {
    this.bookings.set(booking.ref, booking);
    this.holds.delete(booking.ref);
  }

  async release(booking: Booking, demand: Demand): Promise<void> {
    if (!this.bookings.delete(booking.ref)) return;
    this.byKey.delete(booking.idempotencyKey);
    this.holds.delete(booking.ref);
    for (const [id, qty] of demandEntries(demand)) this.stock[id] += qty;
    if (booking.promoCode && isLimitedPromo(booking.promoCode)) {
      const code = normalisePromoCode(booking.promoCode);
      this.promoRemaining.set(code, (this.promoRemaining.get(code) ?? 0) + 1);
    }
  }

  async getBooking(ref: string): Promise<Booking | null> {
    await this.sweepExpiredHolds(Date.now());
    return this.bookings.get(ref) ?? null;
  }

  async sweepExpiredHolds(nowMs: number): Promise<number> {
    let released = 0;
    for (const [ref, until] of [...this.holds]) {
      if (until > nowMs) continue;
      const booking = this.bookings.get(ref);
      if (!booking || booking.status !== "pending") {
        this.holds.delete(ref);
        continue;
      }
      await this.release(booking, demandFromBooking(booking));
      released += 1;
    }
    return released;
  }

  async hitRateLimit(bucket: string, windowSec: number): Promise<number> {
    const now = Date.now();
    const cur = this.rate.get(bucket);
    if (!cur || cur.resetAt <= now) {
      this.rate.set(bucket, { resetAt: now + windowSec * 1000, count: 1 });
      return 1;
    }
    cur.count += 1;
    return cur.count;
  }
}
