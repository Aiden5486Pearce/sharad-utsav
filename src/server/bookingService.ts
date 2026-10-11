import { isLimitedPromo, PRODUCTS } from "@/domain/catalog";
import { tallyDemand } from "@/domain/pricing";
import { normalisePromoCode } from "@/domain/promo";
import { quoteCart } from "@/domain/quote";
import type { ApiError } from "./errors";
import type { Charge } from "./payment";
import { toCart, type Booking, type BookingRequest } from "./schemas";
import type { BookingStore } from "./store/types";
import { HOLD_TTL_MS } from "./store/types";

export interface BookingDeps {
  store: BookingStore;
  charge: Charge;
  now: () => Date;
  newRef: () => string;
}

export type BookingOutcome = { ok: true; booking: Booking; replayed: boolean } | { ok: false; error: ApiError };

const fail = (error: ApiError): BookingOutcome => ({ ok: false, error });

/**
 * The whole booking transaction, in the order that keeps money and stock safe:
 *  1. re-check every rule  2. price it ourselves  3. reserve stock atomically
 *  4. take payment        5. confirm (or give the stock back if payment fails)
 */
export async function createBooking(req: BookingRequest, deps: BookingDeps): Promise<BookingOutcome> {
  const now = deps.now();
  const cart = toCart(req);

  const promoCode = normalisePromoCode(req.promoCode);
  const livePromoUses = promoCode && isLimitedPromo(promoCode) ? await deps.store.getPromoRemaining(promoCode) : null;

  const result = quoteCart(cart, now, livePromoUses);
  if (!result.ok) return fail({ code: "RULE_VIOLATION", message: "Some details need fixing before you can book.", issues: result.issues });
  const { quote } = result;

  if (quote.promo.status === "rejected") {
    return fail({ code: "PROMO_REJECTED", message: quote.promo.message, issues: [{ path: "promoCode", message: quote.promo.message }] });
  }
  if (req.expectedTotalCents !== quote.totalCents) {
    return fail({ code: "PRICE_CHANGED", message: "The price has changed since you last looked. Please review the new total.", quote });
  }

  const people = [req.booker, ...req.guests].map(({ firstName, lastName, age, ticket, dinnerDays, workshopDays }) => ({
    firstName, lastName, age, ticket, dinnerDays, workshopDays,
  }));
  const appliedPromo = quote.promo.status === "applied" ? quote.promo.code : null;
  const pending: Booking = {
    ref: deps.newRef(),
    status: "pending",
    idempotencyKey: req.idempotencyKey,
    createdAt: now.toISOString(),
    contact: { firstName: req.booker.firstName, lastName: req.booker.lastName, email: req.booker.email, phone: req.booker.phone },
    people,
    toddlers: req.toddlers,
    toddlerDinnerDays: req.toddlerDinnerDays ?? [],
    dandiyaPairs: req.dandiyaPairs,
    lines: quote.lines,
    promoCode: appliedPromo,
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    totalCents: quote.totalCents,
    paymentRef: null,
  };
  const demand = tallyDemand(cart);
  const holdUntilMs = now.getTime() + HOLD_TTL_MS;

  const commit = await deps.store.commit(pending, demand, holdUntilMs);
  if (commit.status === "duplicate") {
    return commit.booking.status === "confirmed"
      ? { ok: true, booking: commit.booking, replayed: true }
      : fail({ code: "IN_PROGRESS", message: "Your booking is still being processed. Please wait a moment and check again." });
  }
  if (commit.status === "promo_exhausted") {
    return fail({
      code: "PROMO_REJECTED",
      message: "That promo code has already been used the maximum number of times.",
      issues: [{ path: "promoCode", message: "That promo code has already been used the maximum number of times." }],
    });
  }
  if (commit.status === "insufficient") {
    return fail({
      code: "SOLD_OUT",
      message: "Some items sold out while you were booking. Nothing was charged.",
      shortages: commit.shortages.map((s) => ({ ...s, label: PRODUCTS[s.productId].label })),
    });
  }

  let paymentRef: string | null = null;
  if (quote.totalCents > 0) {
    let charge;
    try {
      charge = await deps.charge(quote.totalCents, req.payment.scenario);
    } catch {
      await deps.store.release(pending, demand);
      return fail({ code: "SERVER_ERROR", message: "We couldn't reach the payment service. You have not been charged. Please try again." });
    }
    if (!charge.ok) {
      await deps.store.release(pending, demand);
      return fail({ code: "PAYMENT_DECLINED", message: charge.message });
    }
    paymentRef = charge.paymentRef;
  }

  const confirmed: Booking = { ...pending, status: "confirmed", paymentRef };
  await deps.store.markConfirmed(confirmed);
  return { ok: true, booking: confirmed, replayed: false };
}
