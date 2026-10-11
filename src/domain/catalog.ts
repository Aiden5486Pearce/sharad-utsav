import type { AgeBracket } from "./age";
import type { Cents } from "./money";

export const PRODUCT_IDS = [
  "dayAdult",
  "dayChild",
  "allDayAdult",
  "allDayChild",
  "familyPass",
  "dandiya",
  "dinner",
  "garba",
] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];

export interface Product {
  id: ProductId;
  label: string;
  /** what one unit of stock is, e.g. one person-day */
  unit: string;
  priceCents: Cents;
  /** Which age bracket the product is for (null = not age based). Rules use THIS, never the label. */
  audience: Exclude<AgeBracket, "toddler"> | null;
  initialStock: number;
}

export const PRODUCTS: Record<ProductId, Product> = {
  dayAdult: { id: "dayAdult", label: "Day Pass – Adult", unit: "person per day", priceCents: 1500, audience: "adult", initialStock: 380 },
  dayChild: { id: "dayChild", label: "Day Pass – Child", unit: "person per day", priceCents: 800, audience: "child", initialStock: 260 },
  allDayAdult: { id: "allDayAdult", label: "All-Day Pass – Adult", unit: "pass", priceCents: 6000, audience: "adult", initialStock: 0 },
  allDayChild: { id: "allDayChild", label: "All-Day Pass – Child", unit: "pass", priceCents: 3000, audience: "child", initialStock: 140 },
  familyPass: { id: "familyPass", label: "Family Pass", unit: "pass", priceCents: 4000, audience: null, initialStock: 95 },
  dandiya: { id: "dandiya", label: "Dandiya Sticks (pair)", unit: "pair", priceCents: 500, audience: null, initialStock: 900 },
  dinner: { id: "dinner", label: "Dinner Plate", unit: "person per day", priceCents: 1200, audience: null, initialStock: 1700 },
  garba: { id: "garba", label: "Garba Workshop", unit: "person per session", priceCents: 2000, audience: null, initialStock: 2 },
};

export const FAMILY_PASS_LIMITS = { minAdults: 1, maxAdults: 2, maxChildren: 2 } as const;

/** Sensible ceilings so nobody can send absurd quantities. */
export const LIMITS = { maxGuests: 19, maxToddlers: 10, maxDandiyaPairs: 30 } as const;

// ---------- promo codes ----------
interface PromoBase {
  code: string;
  description: string;
  /** last day the code works (YYYY-MM-DD, Texas time); null = never expires */
  validUntil: string | null;
  /** null = unlimited */
  usesRemaining: number | null;
}
export type PromoDef = PromoBase &
  (
    | { kind: "percent"; percent: number }
    | { kind: "flat"; cents: Cents }
    | { kind: "childTicketsFree" }
  );

const PROMO_LIST: PromoDef[] = [
  { code: "SEVA10", description: "10% off your booking", kind: "percent", percent: 10, validUntil: null, usesRemaining: null },
  { code: "FLAT20", description: "$20 off your booking", kind: "flat", cents: 2000, validUntil: null, usesRemaining: null },
  { code: "KIDSFREE", description: "Child tickets are free", kind: "childTicketsFree", validUntil: null, usesRemaining: null },
  { code: "EXPIRED5", description: "5% off (expired)", kind: "percent", percent: 5, validUntil: "2026-09-10", usesRemaining: null },
  { code: "MAXEDOUT", description: "10% off (fully used)", kind: "percent", percent: 10, validUntil: null, usesRemaining: 0 },
];
export const PROMOS: ReadonlyMap<string, PromoDef> = new Map(PROMO_LIST.map((p) => [p.code, p]));

/** Codes whose remaining uses are stored (and decremented) in Redis / the booking store. */
export function isLimitedPromo(code: string): boolean {
  const promo = PROMOS.get(code);
  return promo != null && promo.usesRemaining !== null;
}

export function limitedPromoInitialUses(code: string): number | null {
  const promo = PROMOS.get(code);
  return promo != null && promo.usesRemaining !== null ? promo.usesRemaining : null;
}

/** Build a value for every product without casts (the compiler checks no product is forgotten). */
export function forEachProduct<T>(fn: (id: ProductId) => T): Record<ProductId, T> {
  return {
    dayAdult: fn("dayAdult"),
    dayChild: fn("dayChild"),
    allDayAdult: fn("allDayAdult"),
    allDayChild: fn("allDayChild"),
    familyPass: fn("familyPass"),
    dandiya: fn("dandiya"),
    dinner: fn("dinner"),
    garba: fn("garba"),
  };
}
