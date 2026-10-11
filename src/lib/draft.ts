import type { FestivalDay } from "@/domain/festival";
import { attendanceDays } from "@/domain/ticket";
import type { TicketChoice } from "@/domain/types";

export type PassKind = "day" | "allDays" | "family";

/** What the person has typed so far. Raw text for numbers: we never "fix" it silently. */
export interface PersonDraft {
  id: string;
  firstName: string;
  lastName: string;
  ageText: string;
  pass: PassKind;
  days: FestivalDay[];
  familyGroup: number;
  familyDay: FestivalDay;
  dinnerDays: FestivalDay[];
  workshopDays: FestivalDay[];
}
export interface BookerDraft extends PersonDraft {
  email: string;
  phone: string;
}

export function newPerson(id: string): PersonDraft {
  return { id, firstName: "", lastName: "", ageText: "", pass: "day", days: [], familyGroup: 1, familyDay: "2026-11-10", dinnerDays: [], workshopDays: [] };
}

/** Age as the API wants it: a number, or undefined (blank) / NaN→null (nonsense) so the server explains. */
export function ageFromText(text: string): number | undefined {
  const t = text.trim();
  if (t === "") return undefined;
  return /^\d{1,3}$/.test(t) ? Number(t) : Number.NaN;
}

export function ticketOf(p: PersonDraft): TicketChoice {
  if (p.pass === "allDays") return { kind: "allDays" };
  if (p.pass === "family") return { kind: "family", group: p.familyGroup, day: p.familyDay };
  return { kind: "day", days: p.days };
}

/** Extras can only be on days the person attends. After any change, drop the ones that no longer apply. */
export function pruneExtras<T extends PersonDraft>(p: T): T {
  const attending = attendanceDays(ticketOf(p));
  return {
    ...p,
    dinnerDays: p.dinnerDays.filter((d) => attending.includes(d)),
    workshopDays: p.workshopDays.filter((d) => attending.includes(d)),
  };
}

export const toggle = <T,>(list: readonly T[], item: T): T[] =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

function corePerson(p: PersonDraft) {
  return { age: ageFromText(p.ageText), ticket: ticketOf(p), dinnerDays: p.dinnerDays, workshopDays: p.workshopDays };
}
const count = (text: string): number => (text.trim() === "" ? 0 : /^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

export interface DraftState {
  booker: BookerDraft;
  guests: PersonDraft[];
  toddlers: string;
  toddlerDinnerDays: FestivalDay[];
  dandiya: string;
  promo: string;
}

export function toQuoteBody(s: DraftState) {
  const toddlers = count(s.toddlers);
  return {
    booker: corePerson(s.booker),
    guests: s.guests.map(corePerson),
    toddlers,
    toddlerDinnerDays: toddlers > 0 ? s.toddlerDinnerDays : [],
    dandiyaPairs: count(s.dandiya),
    promoCode: s.promo.trim() === "" ? null : s.promo,
  };
}

export function toBookingBody(s: DraftState, expectedTotalCents: number, idempotencyKey: string, scenario: "success" | "decline") {
  const base = toQuoteBody(s);
  return {
    idempotencyKey,
    expectedTotalCents,
    booker: { ...base.booker, firstName: s.booker.firstName, lastName: s.booker.lastName, email: s.booker.email, phone: s.booker.phone },
    guests: base.guests.map((g, i) => ({ ...g, firstName: s.guests[i]?.firstName ?? "", lastName: s.guests[i]?.lastName ?? "" })),
    toddlers: base.toddlers,
    toddlerDinnerDays: base.toddlerDinnerDays,
    dandiyaPairs: base.dandiyaPairs,
    promoCode: base.promoCode,
    payment: { scenario },
  };
}
