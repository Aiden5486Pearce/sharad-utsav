"use client";
import { useCallback, useEffect, useReducer, useState } from "react";
import { formatCents } from "@/domain/money";
import { fetchBooking, fetchCatalog, postBooking } from "@/lib/api";
import { initialState, reducer, type Step } from "@/lib/bookingReducer";
import { toBookingBody } from "@/lib/draft";
import type { Catalog } from "@/lib/responseSchemas";
import { useQuote } from "@/lib/useQuote";
import { contactSchema, identitySchema } from "@/server/schemas";
import { Confirmation } from "./Confirmation";
import { ExtrasStep } from "./ExtrasStep";
import { GroupStep } from "./GroupStep";
import { ReviewStep } from "./ReviewStep";

const STEPS: { id: Step; label: string }[] = [
  { id: "group", label: "Your group" },
  { id: "extras", label: "Extras" },
  { id: "pay", label: "Pay" },
];

export function BookingApp() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(crypto.randomUUID()));
  const quote = useQuote(state);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);

  const loadCatalog = useCallback(async () => {
    const res = await fetchCatalog();
    if (res.ok) { setCatalog(res.data); setCatalogError(false); } else setCatalogError(true);
  }, []);
  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  // Re-open a confirmation from ?ref=… (e.g. after a reload)
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref) return;
    void fetchBooking(ref).then((res) => { if (res.ok) dispatch({ type: "restore", booking: res.data.booking }); });
  }, []);

  /** Name/contact checks use the SAME zod schemas as the server (shared code, not copied rules). */
  function checkContact(): Record<string, string> {
    const errors: Record<string, string> = {};
    const check = (base: string, schema: typeof identitySchema | typeof contactSchema, value: unknown) => {
      const r = schema.safeParse(value);
      if (!r.success) for (const i of r.error.issues) errors[`${base}.${i.path.join(".")}`] ??= i.message;
    };
    check("booker", identitySchema, state.booker);
    check("booker", contactSchema, state.booker);
    state.guests.forEach((g, i) => check(`guests.${i}`, identitySchema, g));
    return errors;
  }

  function goExtras() {
    const localErrors = checkContact();
    dispatch({ type: "attempt", localErrors });
    if (Object.keys(localErrors).length === 0 && quote.status === "ready") dispatch({ type: "goto", step: "extras" });
  }

  async function pay() {
    if (quote.status !== "ready" || state.submit.status === "submitting") return; // also guards a double click
    dispatch({ type: "submitStart" });
    const result = await postBooking(toBookingBody(state, quote.quote.totalCents, state.idempotencyKey, state.scenario));
    if (result.ok) {
      window.history.replaceState(null, "", `?ref=${encodeURIComponent(result.data.booking.ref)}`);
      dispatch({ type: "submitDone", booking: result.data.booking });
      void loadCatalog();
    } else if ("network" in result) {
      dispatch({ type: "submitFail", message: "We lost your connection. You have NOT been charged twice – press Pay again to safely retry; if the first attempt went through you'll just get your confirmation." });
    } else {
      dispatch({ type: "submitFail", message: result.error.message, error: result.error });
      void loadCatalog();
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.id === state.step);
  const total = quote.status === "ready" ? quote.quote.totalCents : quote.status === "loading" ? quote.previous?.totalCents : undefined;

  return (
    <main className="page">
      <header className="hero">
        <h1>Sharad Utsav 2026</h1>
        <p>Radha Krishna Temple, Allen, Texas · Tue 10 – Sat 14 Nov 2026</p>
      </header>

      {catalogError ? (
        <div className="banner" role="alert">
          We couldn't load live availability. <button className="btn ghost small" type="button" onClick={() => void loadCatalog()}>Try again</button>
        </div>
      ) : null}

      {state.step !== "done" ? (
        <ol className="steps" aria-label="Booking steps">
          {STEPS.map((s, i) => <li key={s.id} aria-current={i === stepIndex ? "step" : undefined}>{i + 1}. {s.label}</li>)}
        </ol>
      ) : null}

      {state.step === "group" ? <GroupStep state={state} dispatch={dispatch} catalog={catalog} quote={quote} onContinue={goExtras} /> : null}
      {state.step === "extras" ? <ExtrasStep state={state} dispatch={dispatch} catalog={catalog} quote={quote} onBack={() => dispatch({ type: "goto", step: "group" })} onContinue={() => dispatch({ type: "goto", step: "pay" })} /> : null}
      {state.step === "pay" ? <ReviewStep state={state} dispatch={dispatch} quote={quote} onBack={() => dispatch({ type: "goto", step: "extras" })} onPay={() => void pay()} /> : null}
      {state.step === "done" && state.confirmed ? (
        <Confirmation booking={state.confirmed} onNew={() => { window.history.replaceState(null, "", "/"); dispatch({ type: "reset", idempotencyKey: crypto.randomUUID() }); void loadCatalog(); }} />
      ) : null}

      {state.step !== "done" && state.step !== "pay" ? (
        <div className="bar" aria-live="polite">
          <div className="bar-inner">
            <span>Running total</span>
            <strong>{total !== undefined ? formatCents(total) : "—"}</strong>
          </div>
        </div>
      ) : null}
    </main>
  );
}
