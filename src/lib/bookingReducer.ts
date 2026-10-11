import type { FestivalDay } from "@/domain/festival";
import { attendanceDays } from "@/domain/ticket";
import type { ApiErrorBody, ConfirmedBooking } from "./responseSchemas";
import { newPerson, pruneExtras, ticketOf, toggle, type BookerDraft, type DraftState, type PersonDraft } from "./draft";

export type Step = "group" | "extras" | "pay" | "done";
export type PayScenario = "success" | "decline";

export type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "failed"; message: string; error?: ApiErrorBody };

export interface State extends DraftState {
  step: Step;
  scenario: PayScenario;
  idempotencyKey: string;
  submit: SubmitState;
  confirmed: ConfirmedBooking | null;
  /** field path -> message, from the contact/name checks run when pressing Continue */
  localErrors: Record<string, string>;
  /** true once the person has pressed Continue, so we show everything that's missing */
  attempted: boolean;
}

export type Action =
  | { type: "booker"; patch: Partial<BookerDraft> }
  | { type: "guest"; id: string; patch: Partial<PersonDraft> }
  | { type: "addGuest"; id: string }
  | { type: "removeGuest"; id: string }
  | { type: "field"; field: "toddlers" | "dandiya" | "promo"; value: string }
  | { type: "toddlerDinner"; day: FestivalDay }
  | { type: "attempt"; localErrors: Record<string, string> }
  | { type: "goto"; step: Step }
  | { type: "scenario"; value: PayScenario }
  | { type: "submitStart" }
  | { type: "submitFail"; message: string; error?: ApiErrorBody }
  | { type: "submitDone"; booking: ConfirmedBooking }
  | { type: "restore"; booking: ConfirmedBooking }
  | { type: "reset"; idempotencyKey: string };

export function initialState(idempotencyKey: string): State {
  return {
    step: "group",
    booker: { ...newPerson("booker"), email: "", phone: "" },
    guests: [],
    toddlers: "",
    toddlerDinnerDays: [],
    dandiya: "",
    promo: "",
    scenario: "success",
    idempotencyKey,
    submit: { status: "idle" },
    confirmed: null,
    localErrors: {},
    attempted: false,
  };
}

/** If one family member changes the Family Pass day, everyone on that pass follows (it's one day, one pass). */
function syncFamilyDay(state: State, changed: PersonDraft): State {
  if (changed.pass !== "family") return state;
  const apply = <T extends PersonDraft>(p: T): T =>
    p.pass === "family" && p.familyGroup === changed.familyGroup ? pruneExtras({ ...p, familyDay: changed.familyDay }) : p;
  return { ...state, booker: apply(state.booker), guests: state.guests.map(apply) };
}

/** Toddler dinners only for days someone ticketed is attending. */
function pruneToddlerDinners(state: State): State {
  const days = new Set([
    ...attendanceDays(ticketOf(state.booker)),
    ...state.guests.flatMap((g) => attendanceDays(ticketOf(g))),
  ]);
  return { ...state, toddlerDinnerDays: state.toddlerDinnerDays.filter((d) => days.has(d)) };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "booker": {
      const booker = pruneExtras({ ...state.booker, ...action.patch });
      return pruneToddlerDinners(syncFamilyDay({ ...state, booker }, booker));
    }
    case "guest": {
      const guests = state.guests.map((g) => (g.id === action.id ? pruneExtras({ ...g, ...action.patch }) : g));
      const changed = guests.find((g) => g.id === action.id);
      return changed ? pruneToddlerDinners(syncFamilyDay({ ...state, guests }, changed)) : state;
    }
    case "addGuest":
      return { ...state, guests: [...state.guests, newPerson(action.id)] };
    case "removeGuest":
      return pruneToddlerDinners({ ...state, guests: state.guests.filter((g) => g.id !== action.id) });
    case "field": {
      if (action.field === "toddlers") {
        const n = action.value.trim() === "" ? 0 : Number(action.value);
        const clearDinners = !Number.isInteger(n) || n <= 0;
        return {
          ...state,
          toddlers: action.value,
          toddlerDinnerDays: clearDinners ? [] : state.toddlerDinnerDays,
        };
      }
      return { ...state, [action.field]: action.value };
    }
    case "toddlerDinner":
      return { ...state, toddlerDinnerDays: toggle(state.toddlerDinnerDays, action.day) };
    case "attempt":
      return { ...state, attempted: true, localErrors: action.localErrors };
    case "goto":
      return { ...state, step: action.step, attempted: false, localErrors: {}, submit: { status: "idle" } };
    case "scenario":
      return { ...state, scenario: action.value };
    case "submitStart":
      return { ...state, submit: { status: "submitting" } };
    case "submitFail":
      return { ...state, submit: { status: "failed", message: action.message, error: action.error } };
    case "submitDone":
      return { ...state, step: "done", confirmed: action.booking, submit: { status: "idle" } };
    case "restore":
      return { ...state, step: "done", confirmed: action.booking };
    case "reset":
      return initialState(action.idempotencyKey);
  }
}
