import type { FestivalDay } from "./festival";
import type { ProductId } from "./catalog";
import type { Cents } from "./money";

/** What a person is buying for entry. Impossible mixes (e.g. all-day pass + chosen days) can't be expressed. */
export type TicketChoice =
  | { kind: "day"; days: FestivalDay[] }
  | { kind: "allDays" }
  | { kind: "family"; group: number; day: FestivalDay };

/** The parts of a person that affect rules and price. Index 0 of Cart.people is the person booking. */
export interface PersonCore {
  age: number;
  ticket: TicketChoice;
  dinnerDays: FestivalDay[];
  workshopDays: FestivalDay[];
}

export interface Cart {
  people: readonly PersonCore[];
  toddlers: number;
  /** Dinner plates for under-5s: each selected day × toddler headcount. */
  toddlerDinnerDays: readonly FestivalDay[];
  dandiyaPairs: number;
  promoCode: string | null;
}

export interface PriceLine {
  productId: ProductId;
  label: string;
  quantity: number;
  unitCents: Cents;
  totalCents: Cents;
}

export type PromoRejection = "UNKNOWN" | "EXPIRED" | "MAXED_OUT" | "NOT_APPLICABLE";
export type PromoOutcome =
  | { status: "none" }
  | { status: "applied"; code: string; description: string; discountCents: Cents }
  | { status: "rejected"; code: string; reason: PromoRejection; message: string };

export interface PriceWarning {
  code: "FAMILY_PASS_NOT_CHEAPER";
  message: string;
}

export interface Quote {
  lines: PriceLine[];
  subtotalCents: Cents;
  promo: PromoOutcome;
  discountCents: Cents;
  totalCents: Cents;
  warnings: PriceWarning[];
}

export type RuleCode =
  | "BOOKER_UNDER_18"
  | "UNDER_5_NEEDS_NO_TICKET"
  | "NO_DAYS_SELECTED"
  | "DUPLICATE_DAY"
  | "DAY_PASSED"
  | "ALL_DAY_PASS_CLOSED"
  | "FAMILY_GROUP_DAY_MISMATCH"
  | "FAMILY_TOO_MANY_ADULTS"
  | "FAMILY_NEEDS_AN_ADULT"
  | "FAMILY_TOO_MANY_CHILDREN"
  | "EXTRA_DAY_NOT_ATTENDING"
  | "WORKSHOP_NOT_ON_THAT_DAY"
  | "TOO_MANY_PEOPLE"
  | "TOO_MANY_TODDLERS"
  | "TOO_MANY_STICKS"
  | "TODDLER_DINNER_WITHOUT_TODDLERS"
  | "TODDLER_DINNER_DAY_NOT_ATTENDING";

export interface RuleIssue {
  /** e.g. "booker.age" or "guests.2.dinnerDays" so the UI can show it next to the field */
  path: string;
  code: RuleCode;
  message: string;
}
