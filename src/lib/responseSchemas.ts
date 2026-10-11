import { z } from "zod";
import { PRODUCT_IDS } from "@/domain/catalog";
import { FESTIVAL_DAYS } from "@/domain/festival";
import { bookingRecordSchema } from "@/server/schemas";

const line = z.object({ productId: z.enum(PRODUCT_IDS), label: z.string(), quantity: z.number(), unitCents: z.number(), totalCents: z.number() });
const promo = z.discriminatedUnion("status", [
  z.object({ status: z.literal("none") }),
  z.object({ status: z.literal("applied"), code: z.string(), description: z.string(), discountCents: z.number() }),
  z.object({ status: z.literal("rejected"), code: z.string(), reason: z.string(), message: z.string() }),
]);
export const quoteSchema = z.object({
  lines: z.array(line),
  subtotalCents: z.number(),
  promo,
  discountCents: z.number(),
  totalCents: z.number(),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
});
export type ClientQuote = z.infer<typeof quoteSchema>;

const stockProblem = z.object({ productId: z.enum(PRODUCT_IDS), label: z.string(), requested: z.number(), available: z.number() });

export const quoteResponseSchema = z.object({ quote: quoteSchema, stockProblems: z.array(stockProblem) });

export const catalogSchema = z.object({
  days: z.array(z.enum(FESTIVAL_DAYS)),
  workshopDays: z.array(z.enum(FESTIVAL_DAYS)),
  products: z.array(z.object({
    id: z.enum(PRODUCT_IDS), label: z.string(), unit: z.string(), priceCents: z.number(),
    audience: z.enum(["adult", "child"]).nullable(), remaining: z.number(), soldOut: z.boolean(),
  })),
});
export type Catalog = z.infer<typeof catalogSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    shortages: z.array(stockProblem.extend({ label: z.string() })).optional(),
    quote: quoteSchema.optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>["error"];

export const bookingResponseSchema = z.object({ booking: bookingRecordSchema.omit({ idempotencyKey: true }).extend({ idempotencyKey: z.string().optional() }) });
export type ConfirmedBooking = z.infer<typeof bookingResponseSchema>["booking"];
