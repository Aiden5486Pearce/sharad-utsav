import { PROMOS } from "./catalog";
import { percentOf, type Cents } from "./money";
import { todayAtTemple } from "./festival";
import type { PromoOutcome } from "./types";

export const normalisePromoCode = (raw: string | null): string => (raw ?? "").trim().toUpperCase();

interface PromoContext {
  subtotalCents: Cents;
  /** total of lines that are child tickets (found by product audience, not by name) */
  childTicketCents: Cents;
}

/**
 * @param liveUsesRemaining – for limited codes, remaining uses from the store (Redis).
 *   When omitted, falls back to the catalog seed value (fine for pure unit tests).
 */
export function evaluatePromo(
  rawCode: string | null,
  ctx: PromoContext,
  now: Date,
  liveUsesRemaining?: number | null,
): PromoOutcome {
  const code = normalisePromoCode(rawCode);
  if (code === "") return { status: "none" };

  const promo = PROMOS.get(code);
  if (!promo) {
    return { status: "rejected", code, reason: "UNKNOWN", message: "We don't recognise that code. Please check the spelling." };
  }
  if (promo.validUntil !== null && todayAtTemple(now) > promo.validUntil) {
    return { status: "rejected", code, reason: "EXPIRED", message: `${code} has expired.` };
  }
  const usesRemaining = promo.usesRemaining === null ? null : (liveUsesRemaining ?? promo.usesRemaining);
  if (usesRemaining !== null && usesRemaining <= 0) {
    return { status: "rejected", code, reason: "MAXED_OUT", message: `${code} has already been used the maximum number of times.` };
  }

  let discountCents: Cents;
  switch (promo.kind) {
    case "percent":
      discountCents = percentOf(ctx.subtotalCents, promo.percent);
      break;
    case "flat":
      discountCents = Math.min(promo.cents, ctx.subtotalCents); // never below $0
      break;
    case "childTicketsFree":
      discountCents = ctx.childTicketCents;
      break;
  }

  if (discountCents === 0) {
    return { status: "rejected", code, reason: "NOT_APPLICABLE", message: `${code} only discounts child tickets, and there are none in this booking.` };
  }
  return { status: "applied", code, description: promo.description, discountCents };
}
