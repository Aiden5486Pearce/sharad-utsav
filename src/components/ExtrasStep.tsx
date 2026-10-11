"use client";
import type { Dispatch } from "react";
import { WORKSHOP_DAYS } from "@/domain/festival";
import { attendanceDays } from "@/domain/ticket";
import { bracketForAge } from "@/domain/age";
import { ageFromText, ticketOf, toggle, type PersonDraft } from "@/lib/draft";
import type { Action, State } from "@/lib/bookingReducer";
import type { Catalog } from "@/lib/responseSchemas";
import type { QuoteState } from "@/lib/useQuote";
import { formatCents } from "@/domain/money";
import type { ProductId } from "@/domain/catalog";
import { DayChoices, Field } from "./ui";

function toddlerCount(text: string): number {
  const t = text.trim();
  return t !== "" && /^\d{1,3}$/.test(t) ? Number(t) : 0;
}

interface Props {
  state: State;
  dispatch: Dispatch<Action>;
  catalog: Catalog | null;
  quote: QuoteState;
  onBack: () => void;
  onContinue: () => void;
}

export function ExtrasStep({ state, dispatch, catalog, quote, onBack, onContinue }: Props) {
  const issues = quote.status === "invalid" ? quote.issues : [];
  const price = (id: ProductId) => catalog?.products.find((p) => p.id === id);
  const garba = price("garba");
  const dandiya = price("dandiya");

  const people: { draft: PersonDraft; base: string; name: string; update: (patch: Partial<PersonDraft>) => void }[] = [
    { draft: state.booker, base: "booker", name: state.booker.firstName || "You", update: (patch) => dispatch({ type: "booker", patch }) },
    ...state.guests.map((g, i) => ({ draft: g, base: `guests.${i}`, name: g.firstName || `Guest ${i + 1}`, update: (patch: Partial<PersonDraft>) => dispatch({ type: "guest", id: g.id, patch }) })),
  ];
  const stockMsg = quote.status === "ready" ? quote.stockProblems : [];
  const toddlers = toddlerCount(state.toddlers);
  const groupDays = [
    ...new Set([
      ...attendanceDays(ticketOf(state.booker)),
      ...state.guests.flatMap((g) => attendanceDays(ticketOf(g))),
    ]),
  ];
  const dinner = price("dinner");

  return (
    <>
      <h2>Extras</h2>
      <p className="muted">Everything here is optional. Dinner and workshops can only be added for days that person is attending.</p>

      {people.map(({ draft, base, name, update }) => {
        const age = ageFromText(draft.ageText);
        if (age === undefined || !Number.isInteger(age) || bracketForAge(age) === "toddler") return null;
        const attending = attendanceDays(ticketOf(draft));
        const msg = (s: string) => issues.find((i) => i.path === `${base}.${s}`)?.message;
        return (
          <section className="card" key={draft.id}>
            <h3>{name}</h3>
            <DayChoices legend={`Dinner plate – ${price("dinner") ? formatCents(price("dinner")!.priceCents) : ""} per day`} name={`${draft.id}-dinner`} selected={draft.dinnerDays} enabled={attending} onToggle={(d) => update({ dinnerDays: toggle(draft.dinnerDays, d) })} error={msg("dinnerDays")} />
            <DayChoices legend={`Garba Workshop – ${garba ? formatCents(garba.priceCents) : ""} (11 and 13 Nov only)`} name={`${draft.id}-garba`} days={WORKSHOP_DAYS} selected={draft.workshopDays} enabled={attending.filter((d) => WORKSHOP_DAYS.includes(d))} onToggle={(d) => update({ workshopDays: toggle(draft.workshopDays, d) })} error={msg("workshopDays")} />
          </section>
        );
      })}
      {toddlers > 0 ? (
        <section className="card">
          <h3>Dinner for children under 5</h3>
          <p className="hint">
            Under-5s need no ticket, but dinner is still {dinner ? formatCents(dinner.priceCents) : "$12"} per child per day
            ({toddlers} × days you pick).
          </p>
          <DayChoices
            legend="Toddler dinner days"
            name="toddler-dinner"
            selected={state.toddlerDinnerDays}
            enabled={groupDays}
            onToggle={(d) => dispatch({ type: "toddlerDinner", day: d })}
            error={issues.find((i) => i.path === "toddlerDinnerDays")?.message}
          />
        </section>
      ) : null}

      {garba ? (
        garba.soldOut ? <p className="banner info" role="status">The Garba Workshop is sold out.</p>
          : garba.remaining <= 10 ? <p className="banner info" role="status">Only {garba.remaining} Garba Workshop place{garba.remaining === 1 ? "" : "s"} left in total.</p> : null
      ) : null}

      <section className="card">
        <Field id="dandiya" label={`Dandiya sticks (pair) – ${dandiya ? formatCents(dandiya.priceCents) : ""} each`} error={issues.find((i) => i.path === "dandiyaPairs")?.message} hint="How many pairs?">
          {(a) => <input {...a} type="text" inputMode="numeric" value={state.dandiya} onChange={(e) => dispatch({ type: "field", field: "dandiya", value: e.target.value })} />}
        </Field>
      </section>

      {stockMsg.length > 0 ? (
        <div className="banner" role="alert">
          {stockMsg.map((s) => <p key={s.productId} style={{ margin: 0 }}>Only {s.available} {s.label} left, and you've asked for {s.requested}. Please reduce it.</p>)}
        </div>
      ) : null}

      <div className="actions">
        <button type="button" className="btn ghost" onClick={onBack}>Back</button>
        <button type="button" className="btn" onClick={onContinue} disabled={quote.status === "invalid" || stockMsg.length > 0}>Review &amp; pay</button>
      </div>
    </>
  );
}
