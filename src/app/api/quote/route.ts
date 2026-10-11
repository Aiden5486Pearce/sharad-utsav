import { isLimitedPromo, PRODUCTS } from "@/domain/catalog";
import { demandEntries, tallyDemand } from "@/domain/pricing";
import { normalisePromoCode } from "@/domain/promo";
import { quoteCart } from "@/domain/quote";
import { errorResponse, invalidRequest, readJson, serverError } from "@/server/http";
import { quoteRequestSchema, toCart } from "@/server/schemas";
import { getStore } from "@/server/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST /api/quote – price a work-in-progress booking. Returns rule issues, or a quote plus any stock problems. */
export async function POST(req: Request) {
  const parsed = quoteRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalidRequest(parsed.error);

  const cart = toCart(parsed.data);
  const code = normalisePromoCode(parsed.data.promoCode);

  try {
    const store = getStore();
    const livePromoUses = code && isLimitedPromo(code) ? await store.getPromoRemaining(code) : null;
    const result = quoteCart(cart, new Date(), livePromoUses);
    if (!result.ok) {
      return errorResponse({ code: "RULE_VIOLATION", message: "Some details need fixing.", issues: result.issues });
    }

    // Early warning only: the real stock check happens atomically when the booking is made.
    const stock = await store.getStock();
    const stockProblems = demandEntries(tallyDemand(cart))
      .filter(([id, qty]) => stock[id] < qty)
      .map(([id, qty]) => ({ productId: id, label: PRODUCTS[id].label, requested: qty, available: stock[id] }));
    return NextResponse.json({ quote: result.quote, stockProblems });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
