import type { FestivalDay } from "@/domain/festival";
import type { Cart, PersonCore, TicketChoice } from "@/domain/types";

export const NOW = new Date("2026-10-10T15:00:00Z"); // before the festival
export const D = {
  d10: "2026-11-10", d11: "2026-11-11", d12: "2026-11-12", d13: "2026-11-13", d14: "2026-11-14",
} as const satisfies Record<string, FestivalDay>;

export const person = (age: number, ticket: TicketChoice, extra: Partial<PersonCore> = {}): PersonCore => ({
  age, ticket, dinnerDays: [], workshopDays: [], ...extra,
});
export const dayPass = (...days: FestivalDay[]): TicketChoice => ({ kind: "day", days });
export const cart = (people: PersonCore[], extra: Partial<Cart> = {}): Cart => ({
  people, toddlers: 0, toddlerDinnerDays: [], dandiyaPairs: 0, promoCode: null, ...extra,
});
