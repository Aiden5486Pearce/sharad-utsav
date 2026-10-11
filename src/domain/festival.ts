export const EVENT = {
  name: "Sharad Utsav 2026",
  location: "Radha Krishna Temple, Allen, Texas",
  timeZone: "America/Chicago",
  currency: "USD",
} as const;

export const FESTIVAL_DAYS = [
  "2026-11-10",
  "2026-11-11",
  "2026-11-12",
  "2026-11-13",
  "2026-11-14",
] as const;
export type FestivalDay = (typeof FESTIVAL_DAYS)[number];

/** Garba Workshop only runs on these two days (Nov 11 and Nov 13). */
export const WORKSHOP_DAYS: readonly FestivalDay[] = ["2026-11-11", "2026-11-13"];

export function isFestivalDay(value: string): value is FestivalDay {
  return (FESTIVAL_DAYS as readonly string[]).includes(value);
}

/** Today's calendar date at the temple (Texas), as YYYY-MM-DD. */
export function todayAtTemple(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** A day can be booked until that day is over (Texas time). */
export function isDayStillBookable(day: FestivalDay, now: Date): boolean {
  return day >= todayAtTemple(now);
}

/** The All-Day pass is only sold before the festival starts. */
export function isAllDayPassBookable(now: Date): boolean {
  const first = FESTIVAL_DAYS[0];
  return todayAtTemple(now) <= first;
}
