import type { ProductId } from "@/domain/catalog";
import type { Demand } from "@/domain/pricing";
import type { Booking } from "../schemas";

export type StockLevels = Record<ProductId, number>;
export interface Shortage {
  productId: ProductId;
  requested: number;
  available: number;
}

/** How long a pending (unpaid) booking may hold stock before it is released. */
export const HOLD_TTL_MS = 15 * 60 * 1000;

export type CommitResult =
  | { status: "committed" }
  | { status: "duplicate"; booking: Booking }
  | { status: "insufficient"; shortages: Shortage[] }
  | { status: "promo_exhausted" };

export interface BookingStore {
  getStock(): Promise<StockLevels>;
  /** Remaining uses for a limited promo, or null if the code is unlimited / unknown. */
  getPromoRemaining(code: string): Promise<number | null>;
  /**
   * ATOMIC: either every product in `demand` is decremented (and a limited promo decremented)
   * and the booking saved, or nothing changes. Also enforces idempotency.
   */
  commit(booking: Booking, demand: Demand, holdUntilMs: number): Promise<CommitResult>;
  markConfirmed(booking: Booking): Promise<void>;
  /** Undo a commit (e.g. payment declined): put stock/promo back, forget the booking and its key. */
  release(booking: Booking, demand: Demand): Promise<void>;
  getBooking(ref: string): Promise<Booking | null>;
  /** Release pending bookings whose hold has expired. Safe to call often. */
  sweepExpiredHolds(nowMs: number): Promise<number>;
  /** Sliding-window counter for rate limits. Returns the new count in the window. */
  hitRateLimit(bucket: string, windowSec: number): Promise<number>;
}

/** Rebuild demand from saved price lines (same units we decremented). */
export function demandFromBooking(booking: Booking): Demand {
  const demand: Demand = {};
  for (const line of booking.lines) {
    demand[line.productId] = (demand[line.productId] ?? 0) + line.quantity;
  }
  return demand;
}
