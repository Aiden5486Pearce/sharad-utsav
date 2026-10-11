export type PaymentScenario = "success" | "decline";
export type ChargeResult = { ok: true; paymentRef: string } | { ok: false; message: string };
export type Charge = (amountCents: number, scenario: PaymentScenario) => Promise<ChargeResult>;

/**
 * Simulated payment: the "card" is a test scenario the person picks. The amount comes from the
 * server's own quote. To go live, replace this with a Stripe PaymentIntent created for
 * `amountCents` (and confirm it via webhook).
 */
export const simulatedCharge: Charge = async (amountCents, scenario) => {
  await new Promise((r) => setTimeout(r, 600));
  if (scenario === "decline") return { ok: false, message: "Your card was declined. No money was taken. Please try another card." };
  return { ok: true, paymentRef: `sim_${amountCents}_${crypto.randomUUID().slice(0, 8)}` };
};
