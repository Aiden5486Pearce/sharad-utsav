/** All money is integer cents. Never use floats for currency. */
export type Cents = number;

export function formatCents(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars.toLocaleString("en-US")}.${rest}`;
}

/** percent of cents, rounded half-up, integers only. */
export function percentOf(cents: Cents, percent: number): Cents {
  return Math.floor((cents * percent + 50) / 100);
}
