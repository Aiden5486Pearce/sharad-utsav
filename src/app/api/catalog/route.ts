import { EVENT, FESTIVAL_DAYS, WORKSHOP_DAYS } from "@/domain/festival";
import { PRODUCT_IDS, PRODUCTS } from "@/domain/catalog";
import { getStore } from "@/server/store";
import { NextResponse } from "next/server";
import { serverError } from "@/server/http";

export const dynamic = "force-dynamic";

/** GET /api/catalog – event info, prices and LIVE remaining stock. */
export async function GET() {
  try {
    const stock = await getStore().getStock();
    return NextResponse.json({
      event: EVENT,
      days: FESTIVAL_DAYS,
      workshopDays: WORKSHOP_DAYS,
      products: PRODUCT_IDS.map((id) => ({
        id,
        label: PRODUCTS[id].label,
        unit: PRODUCTS[id].unit,
        priceCents: PRODUCTS[id].priceCents,
        audience: PRODUCTS[id].audience,
        remaining: stock[id],
        soldOut: stock[id] <= 0,
      })),
    });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
