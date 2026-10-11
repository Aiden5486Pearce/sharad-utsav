import type { ApiError } from "./errors";
import type { BookingStore } from "./store/types";

/** Max POST /api/bookings attempts per IP per window. Generous for a family, tight enough to blunt abuse. */
export const BOOKING_RATE_LIMIT = { windowSec: 60, max: 20 } as const;

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function checkBookingRateLimit(store: BookingStore, req: Request): Promise<ApiError | null> {
  const count = await store.hitRateLimit(`book:${clientIp(req)}`, BOOKING_RATE_LIMIT.windowSec);
  if (count > BOOKING_RATE_LIMIT.max) {
    return {
      code: "RATE_LIMITED",
      message: "Too many booking attempts from this network. Please wait a minute and try again.",
    };
  }
  return null;
}
