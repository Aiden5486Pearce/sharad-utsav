import { FESTIVAL_DAYS, type FestivalDay } from "./festival";
import type { ProductId } from "./catalog";
import type { PayingBracket } from "./age";
import type { TicketChoice } from "./types";

/** Which days is this person physically at the festival? */
export function attendanceDays(ticket: TicketChoice): readonly FestivalDay[] {
  switch (ticket.kind) {
    case "day":
      return ticket.days;
    case "allDays":
      return FESTIVAL_DAYS;
    case "family":
      return [ticket.day];
  }
}

/** The entry product for a day/all-day pass is DERIVED from age, so an adult ticket can't be put on a 7-year-old. */
export function entryProductFor(kind: "day" | "allDays", bracket: PayingBracket): ProductId {
  if (kind === "day") return bracket === "adult" ? "dayAdult" : "dayChild";
  return bracket === "adult" ? "allDayAdult" : "allDayChild";
}
