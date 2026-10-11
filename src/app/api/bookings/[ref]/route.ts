import { errorResponse, serverError } from "@/server/http";
import { getStore } from "@/server/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/bookings/:ref – fetch a confirmed booking (the ref is unguessable). */
export async function GET(_req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  try {
    const booking = await getStore().getBooking(ref);
    if (!booking || booking.status !== "confirmed") return errorResponse({ code: "NOT_FOUND", message: "We couldn't find that booking." });
    const { idempotencyKey: _omit, ...publicBooking } = booking;
    return NextResponse.json({ booking: publicBooking });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
