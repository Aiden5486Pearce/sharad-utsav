const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid reading mistakes at the door

/** Unguessable reference (10 chars from a crypto source), e.g. SU26-K7M2XQ9PTA */
export function newBookingRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return "SU26-" + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
