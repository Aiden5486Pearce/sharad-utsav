import { priceCart } from "./pricing";
import type { Cart, Quote, RuleIssue } from "./types";
import { validateCart } from "./validate";

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; issues: RuleIssue[] };

/** The one door to a price: rules first, then pricing. A price is never produced for an invalid cart. */
export function quoteCart(cart: Cart, now: Date, livePromoUses?: number | null): QuoteResult {
  const issues = validateCart(cart, now);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, quote: priceCart(cart, now, livePromoUses) };
}
