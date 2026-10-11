import { useEffect, useMemo, useState } from "react";
import { fetchQuote } from "./api";
import { toQuoteBody, type DraftState } from "./draft";
import type { ApiErrorBody, ClientQuote } from "./responseSchemas";

export interface StockProblem { productId: string; label: string; requested: number; available: number }

export type QuoteState =
  | { status: "loading"; previous: ClientQuote | null }
  | { status: "ready"; quote: ClientQuote; stockProblems: StockProblem[] }
  | { status: "invalid"; issues: { path: string; message: string }[] }
  | { status: "offline" }
  | { status: "failed"; message: string };

/** Asks the SERVER for the price + rule check whenever the draft changes (debounced). The UI never computes money. */
export function useQuote(draft: DraftState): QuoteState {
  const body = useMemo(() => JSON.stringify(toQuoteBody(draft)), [draft]);
  const [state, setState] = useState<QuoteState>({ status: "loading", previous: null });

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ status: "loading", previous: s.status === "ready" ? s.quote : s.status === "loading" ? s.previous : null }));
    const timer = setTimeout(async () => {
      try {
        const result = await fetchQuote(JSON.parse(body), controller.signal);
        if (result.ok) setState({ status: "ready", quote: result.data.quote, stockProblems: result.data.stockProblems });
        else if ("network" in result) setState({ status: "offline" });
        else setState(toFailure(result.error));
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setState({ status: "failed", message: "Couldn't work out the price. Please try again." });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [body]);

  return state;
}

function toFailure(error: ApiErrorBody): QuoteState {
  if (error.issues) return { status: "invalid", issues: error.issues };
  return { status: "failed", message: error.message };
}
