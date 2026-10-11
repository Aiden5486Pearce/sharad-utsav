import { apiErrorSchema, bookingResponseSchema, catalogSchema, quoteResponseSchema, type ApiErrorBody, type Catalog, type ConfirmedBooking } from "./responseSchemas";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody } | { ok: false; network: true };

async function call<T>(url: string, init: RequestInit | undefined, parse: (body: unknown) => T): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false, network: true };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: { code: "SERVER_ERROR", message: "We got an unexpected reply from the server. Please try again." } };
  }
  if (res.ok) return { ok: true, data: parse(body) };
  const err = apiErrorSchema.safeParse(body);
  return { ok: false, error: err.success ? err.data.error : { code: "SERVER_ERROR", message: "Something went wrong. Please try again." } };
}

const post = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body), // NaN becomes null, which the server then explains to the person
  signal,
});

export const fetchCatalog = (): Promise<ApiResult<Catalog>> => call("/api/catalog", { cache: "no-store" }, (b) => catalogSchema.parse(b));
export const fetchQuote = (body: unknown, signal: AbortSignal) => call("/api/quote", post(body, signal), (b) => quoteResponseSchema.parse(b));
export const postBooking = (body: unknown): Promise<ApiResult<{ booking: ConfirmedBooking }>> => call("/api/bookings", post(body), (b) => bookingResponseSchema.parse(b));
export const fetchBooking = (ref: string) => call(`/api/bookings/${encodeURIComponent(ref)}`, { cache: "no-store" }, (b) => bookingResponseSchema.parse(b));
