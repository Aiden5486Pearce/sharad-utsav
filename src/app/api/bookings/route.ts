import { createBooking } from "@/server/bookingService";
import { errorResponse, invalidRequest, readJson, serverError } from "@/server/http";
import { simulatedCharge } from "@/server/payment";
import { checkBookingRateLimit } from "@/server/rateLimit";
import { newBookingRef } from "@/server/ref";
import { bookingRequestSchema } from "@/server/schemas";
import { getStore } from "@/server/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST /api/bookings – validate, price, reserve stock, pay, confirm. */
export async function POST(req: Request) {
  const parsed = bookingRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalidRequest(parsed.error);

  try {
    const store = getStore();
    const limited = await checkBookingRateLimit(store, req);
    if (limited) return errorResponse(limited);

    const outcome = await createBooking(parsed.data, {
      store,
      charge: simulatedCharge,
      now: () => new Date(),
      newRef: newBookingRef,
    });
    if (!outcome.ok) return errorResponse(outcome.error);
    return NextResponse.json({ booking: outcome.booking, replayed: outcome.replayed }, { status: outcome.replayed ? 200 : 201 });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
