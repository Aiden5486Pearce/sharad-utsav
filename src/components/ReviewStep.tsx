"use client";
import type { Dispatch } from "react";
import { formatCents } from "@/domain/money";
import type { Action, State } from "@/lib/bookingReducer";
import type { QuoteState } from "@/lib/useQuote";
import { Choice, Field } from "./ui";

interface Props {
  state: State;
  dispatch: Dispatch<Action>;
  quote: QuoteState;
  onBack: () => void;
  onPay: () => void;
}

export function ReviewStep({ state, dispatch, quote, onBack, onPay }: Props) {
  const ready = quote.status === "ready" ? quote : null;
  const q = ready?.quote ?? (quote.status === "loading" ? quote.previous : null);
  const promo = q?.promo;
  const promoMsg = promo?.status === "rejected" ? promo.message : undefined;
  const submitting = state.submit.status === "submitting";
  const canPay = ready !== null && ready.quote.promo.status !== "rejected" && ready.stockProblems.length === 0 && !submitting;

  return (
    <>
      <h2>Review &amp; pay</h2>

      <div className="panel">
        <h3>Your order</h3>
        {q ? (
          <table className="lines" aria-live="polite" aria-busy={quote.status === "loading"}>
            <tbody className={quote.status === "loading" ? "skeleton" : undefined}>
              {q.lines.map((l) => (
                <tr key={l.productId}><td>{l.label} × {l.quantity}</td><td>{formatCents(l.totalCents)}</td></tr>
              ))}
              {q.discountCents > 0 && promo?.status === "applied" ? (
                <tr><td>Promo {promo.code} – {promo.description}</td><td>−{formatCents(q.discountCents)}</td></tr>
              ) : null}
              <tr className="total"><td>Total</td><td>{formatCents(q.totalCents)}</td></tr>
            </tbody>
          </table>
        ) : <p>Working out your price…</p>}
        {q?.warnings.map((w) => <p className="hint" key={w.message}>💡 {w.message}</p>)}
        {quote.status === "invalid" ? <p className="err" role="alert">Something in your booking needs fixing – please go back.</p> : null}
        {quote.status === "offline" ? <p className="err" role="alert">You seem to be offline. Reconnect to see your price.</p> : null}
        {quote.status === "failed" ? <p className="err" role="alert">{quote.message}</p> : null}
        {ready && ready.stockProblems.length > 0 ? (
          <p className="err" role="alert">{ready.stockProblems.map((s) => `Only ${s.available} ${s.label} left (you asked for ${s.requested}).`).join(" ")} Please go back and change it.</p>
        ) : null}

        <div style={{ marginTop: ".75rem" }}>
          <Field id="promo" label="Promo code (optional)" error={promoMsg} hint={promo?.status === "applied" ? undefined : undefined}>
            {(a) => <input {...a} type="text" autoCapitalize="characters" autoComplete="off" value={state.promo} onChange={(e) => dispatch({ type: "field", field: "promo", value: e.target.value })} />}
          </Field>
          {promo?.status === "applied" ? <p className="hint" style={{ color: "var(--primary-text)" }}>✓ {promo.code} applied: {promo.description}.</p> : null}
        </div>
      </div>

      <section className="card">
        <h3>Payment <span className="muted">(test mode – no real money)</span></h3>
        <fieldset>
          <legend>Pretend the card…</legend>
          <div className="choices">
            <Choice name="scenario" checked={state.scenario === "success"} onChange={() => dispatch({ type: "scenario", value: "success" })}>works (4242…)</Choice>
            <Choice name="scenario" checked={state.scenario === "decline"} onChange={() => dispatch({ type: "scenario", value: "decline" })}>is declined</Choice>
          </div>
        </fieldset>
      </section>

      {state.submit.status === "failed" ? (
        <div className="banner" role="alert">
          <strong>{state.submit.message}</strong>
          {state.submit.error?.shortages?.map((s) => <p key={s.productId} style={{ margin: ".25rem 0 0" }}>{s.label}: {s.available} left, you asked for {s.requested}.</p>)}
        </div>
      ) : null}

      <div className="actions">
        <button type="button" className="btn ghost" onClick={onBack} disabled={submitting}>Back</button>
        <button type="button" className="btn" onClick={onPay} disabled={!canPay} aria-busy={submitting}>
          {submitting ? "Processing…" : q ? `Pay ${formatCents(q.totalCents)}` : "Pay"}
        </button>
      </div>
    </>
  );
}
