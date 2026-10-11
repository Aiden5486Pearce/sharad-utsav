import { AGE, bracketForAge } from "./age";
import { FAMILY_PASS_LIMITS, LIMITS } from "./catalog";
import {
  isAllDayPassBookable,
  isDayStillBookable,
  WORKSHOP_DAYS,
  type FestivalDay,
} from "./festival";
import { attendanceDays } from "./ticket";
import type { Cart, PersonCore, RuleCode, RuleIssue } from "./types";

const personPath = (index: number): string => (index === 0 ? "booker" : `guests.${index - 1}`);

/**
 * Every business rule from sections 3, 4 and 5 of the brief. Runs on the server for every
 * request; the UI also calls it (via /api/quote) so the messages come from one place.
 */
export function validateCart(cart: Cart, now: Date): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const add = (path: string, code: RuleCode, message: string) => issues.push({ path, code, message });

  if (cart.people.length - 1 > LIMITS.maxGuests) {
    add("guests", "TOO_MANY_PEOPLE", `A single booking can include up to ${LIMITS.maxGuests + 1} people. Please make a second booking for the rest.`);
  }
  if (cart.toddlers > LIMITS.maxToddlers) {
    add("toddlers", "TOO_MANY_TODDLERS", `Please enter ${LIMITS.maxToddlers} or fewer under-5s.`);
  }
  if (cart.dandiyaPairs > LIMITS.maxDandiyaPairs) {
    add("dandiyaPairs", "TOO_MANY_STICKS", `Up to ${LIMITS.maxDandiyaPairs} pairs of Dandiya sticks per booking, please.`);
  }

  cart.people.forEach((person, index) => validatePerson(person, index, now, add));
  validateFamilyGroups(cart, add);
  validateToddlerDinners(cart, add);
  return issues;
}

type Add = (path: string, code: RuleCode, message: string) => void;

function validatePerson(person: PersonCore, index: number, now: Date, add: Add): void {
  const path = personPath(index);
  const bracket = bracketForAge(person.age);

  if (index === 0 && person.age < AGE.bookerMin) {
    add(`${path}.age`, "BOOKER_UNDER_18", "The person booking must be 18 or older, because they are the one paying.");
  } else if (bracket === "toddler") {
    add(`${path}.age`, "UNDER_5_NEEDS_NO_TICKET", "Children under 5 come free and don't need a ticket. Add them to the 'under 5' count instead.");
    return; // nothing else about this person is meaningful
  }

  const { ticket } = person;
  if (ticket.kind === "day") {
    if (ticket.days.length === 0) add(`${path}.ticket.days`, "NO_DAYS_SELECTED", "Choose at least one day.");
    if (new Set(ticket.days).size !== ticket.days.length) add(`${path}.ticket.days`, "DUPLICATE_DAY", "Each day can only be picked once.");
    if (ticket.days.some((d) => !isDayStillBookable(d, now))) add(`${path}.ticket.days`, "DAY_PASSED", "One of those days has already finished.");
  } else if (ticket.kind === "allDays") {
    if (!isAllDayPassBookable(now)) add(`${path}.ticket`, "ALL_DAY_PASS_CLOSED", "The festival has started, so the All-Day pass is no longer sold. Day passes are still available.");
  } else if (!isDayStillBookable(ticket.day, now)) {
    add(`${path}.ticket.day`, "DAY_PASSED", "That day has already finished.");
  }

  const attending = attendanceDays(ticket);
  checkExtraDays(person.dinnerDays, attending, `${path}.dinnerDays`, "dinner", add);
  checkExtraDays(person.workshopDays, attending, `${path}.workshopDays`, "workshop", add);
  for (const day of person.workshopDays) {
    if (!WORKSHOP_DAYS.includes(day)) {
      add(`${path}.workshopDays`, "WORKSHOP_NOT_ON_THAT_DAY", "The Garba Workshop only runs on 11 and 13 November.");
      break;
    }
  }
}

function checkExtraDays(days: FestivalDay[], attending: readonly FestivalDay[], path: string, what: string, add: Add): void {
  if (new Set(days).size !== days.length) add(path, "DUPLICATE_DAY", "Each day can only be picked once.");
  if (days.some((d) => !attending.includes(d))) {
    add(path, "EXTRA_DAY_NOT_ATTENDING", `A ${what} can only be added for a day this person is attending.`);
  }
}

function validateToddlerDinners(cart: Cart, add: Add): void {
  if (cart.toddlerDinnerDays.length === 0) return;
  if (cart.toddlers <= 0) {
    add("toddlerDinnerDays", "TODDLER_DINNER_WITHOUT_TODDLERS", "Add at least one child under 5 before choosing toddler dinner plates.");
    return;
  }
  if (new Set(cart.toddlerDinnerDays).size !== cart.toddlerDinnerDays.length) {
    add("toddlerDinnerDays", "DUPLICATE_DAY", "Each day can only be picked once.");
  }
  const groupDays = new Set(cart.people.flatMap((p) => attendanceDays(p.ticket)));
  if (cart.toddlerDinnerDays.some((d) => !groupDays.has(d))) {
    add(
      "toddlerDinnerDays",
      "TODDLER_DINNER_DAY_NOT_ATTENDING",
      "Toddler dinner plates can only be added for a day someone in your booking is attending.",
    );
  }
}

function validateFamilyGroups(cart: Cart, add: Add): void {
  const groups = new Map<number, { index: number; day: FestivalDay; adult: boolean }[]>();
  cart.people.forEach((person, index) => {
    if (person.ticket.kind !== "family" || bracketForAge(person.age) === "toddler") return;
    const members = groups.get(person.ticket.group) ?? [];
    members.push({ index, day: person.ticket.day, adult: bracketForAge(person.age) === "adult" });
    groups.set(person.ticket.group, members);
  });

  for (const [group, members] of groups) {
    const adults = members.filter((m) => m.adult).length;
    const children = members.length - adults;
    const path = personPath(members[0]?.index ?? 0);
    if (new Set(members.map((m) => m.day)).size > 1) {
      add(`${path}.ticket`, "FAMILY_GROUP_DAY_MISMATCH", `Family Pass ${group} is for a single day, so everyone on it must use the same day.`);
    }
    if (adults > FAMILY_PASS_LIMITS.maxAdults) {
      add(`${path}.ticket`, "FAMILY_TOO_MANY_ADULTS", `A Family Pass covers up to ${FAMILY_PASS_LIMITS.maxAdults} adults (age 12+). Put the extra person on their own ticket.`);
    }
    if (adults < FAMILY_PASS_LIMITS.minAdults) {
      add(`${path}.ticket`, "FAMILY_NEEDS_AN_ADULT", "A Family Pass needs at least one adult (age 12+).");
    }
    if (children > FAMILY_PASS_LIMITS.maxChildren) {
      add(`${path}.ticket`, "FAMILY_TOO_MANY_CHILDREN", `A Family Pass covers up to ${FAMILY_PASS_LIMITS.maxChildren} children (age 5–11). Put the extra child on their own ticket.`);
    }
  }
}
