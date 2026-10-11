"use client";
import type { Dispatch } from "react";
import type { Action, State } from "@/lib/bookingReducer";
import type { Catalog } from "@/lib/responseSchemas";
import type { QuoteState } from "@/lib/useQuote";
import { Field } from "./ui";
import { PersonCard } from "./PersonCard";

interface Props {
  state: State;
  dispatch: Dispatch<Action>;
  catalog: Catalog | null;
  quote: QuoteState;
  onContinue: () => void;
}

export function GroupStep({ state, dispatch, catalog, quote, onContinue }: Props) {
  const issues = quote.status === "invalid" ? quote.issues : [];
  // Don't nag about a person until they've started filling them in (or pressed Continue)
  const visible = (started: boolean, base: string) => (state.attempted || started ? issues.filter((i) => i.path.startsWith(base)) : []);
  const globalMsg = (path: string) => issues.find((i) => i.path === path)?.message;

  const allDayAdult = catalog?.products.find((p) => p.id === "allDayAdult");

  return (
    <>
      <h2>Who is coming?</h2>
      <p className="muted">You are the person booking, and you're counted as one of the visitors. Add everyone else who needs a ticket.</p>

      {allDayAdult?.soldOut ? (
        <p className="banner info" role="status">All-Day Pass – Adult is sold out. Day passes and the Family Pass are still available.</p>
      ) : null}

      <PersonCard
        person={state.booker}
        base="booker"
        title="You (person booking)"
        isBooker
        catalog={catalog}
        issues={visible(state.booker.ageText !== "" || state.booker.firstName !== "", "booker")}
        localErrors={state.localErrors}
        onChange={(patch) => dispatch({ type: "booker", patch })}
      />

      {state.guests.map((g, i) => (
        <PersonCard
          key={g.id}
          person={g}
          base={`guests.${i}`}
          title={`Guest ${i + 1}`}
          isBooker={false}
          catalog={catalog}
          issues={visible(g.ageText !== "" || g.firstName !== "", `guests.${i}`)}
          localErrors={state.localErrors}
          onChange={(patch) => dispatch({ type: "guest", id: g.id, patch })}
          onRemove={() => dispatch({ type: "removeGuest", id: g.id })}
        />
      ))}
      {globalMsg("guests") ? <p className="err" role="alert">{globalMsg("guests")}</p> : null}

      <button type="button" className="btn ghost" onClick={() => dispatch({ type: "addGuest", id: crypto.randomUUID() })}>+ Add a person</button>

      <section className="card">
        <Field id="toddlers" label="Children under 5 (free, no ticket)" error={globalMsg("toddlers")} hint="Just a headcount so the volunteers know to expect them.">
          {(a) => <input {...a} type="text" inputMode="numeric" value={state.toddlers} onChange={(e) => dispatch({ type: "field", field: "toddlers", value: e.target.value })} />}
        </Field>
      </section>

      <div className="actions">
        <button type="button" className="btn" onClick={onContinue}>Continue to extras</button>
      </div>
      {state.attempted && quote.status === "invalid" ? <p className="err" role="alert">Please fix the highlighted details above to continue.</p> : null}
    </>
  );
}
