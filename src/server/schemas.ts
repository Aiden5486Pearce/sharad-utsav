import { z } from "zod";
import { AGE } from "@/domain/age";
import { PRODUCT_IDS } from "@/domain/catalog";
import { FESTIVAL_DAYS } from "@/domain/festival";
import type { Cart, PersonCore, TicketChoice } from "@/domain/types";

const day = z.enum(FESTIVAL_DAYS, { errorMap: () => ({ message: "Choose a festival date between 10 and 14 Nov 2026." }) });

export const ticketSchema: z.ZodType<TicketChoice> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("day"), days: z.array(day).max(FESTIVAL_DAYS.length) }),
  z.object({ kind: z.literal("allDays") }),
  z.object({ kind: z.literal("family"), group: z.number().int().min(1).max(10), day }),
]);

const ageMessage = `Enter age as a whole number between 0 and ${AGE.max}, e.g. 9.`;
const ageSchema = z
  .number({ invalid_type_error: ageMessage, required_error: "Enter an age." })
  .int(ageMessage)
  .min(0, ageMessage)
  .max(AGE.max, ageMessage);

export const personCoreSchema = z.object({
  age: ageSchema,
  ticket: ticketSchema,
  dinnerDays: z.array(day).max(FESTIVAL_DAYS.length),
  workshopDays: z.array(day).max(FESTIVAL_DAYS.length),
}) satisfies z.ZodType<PersonCore>;

const name = (label: string) => z.string().trim().min(1, `Enter ${label}.`).max(60, `${label} is too long.`);
export const identitySchema = z.object({ firstName: name("a first name"), lastName: name("a last name") });
export const personSchema = personCoreSchema.merge(identitySchema);

export const contactSchema = z.object({
  email: z.string().trim().max(120).email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .refine((v) => /^[0-9+()\-\s.]+$/.test(v) && v.replace(/\D/g, "").length >= 10 && v.replace(/\D/g, "").length <= 15, "Enter a valid phone number, e.g. 214 555 0123."),
});

const extras = {
  toddlers: z.number().int("Enter a whole number.").min(0, "Can't be negative."),
  toddlerDinnerDays: z.array(day).max(FESTIVAL_DAYS.length).default([]),
  dandiyaPairs: z.number().int("Enter a whole number.").min(0, "Can't be negative."),
  promoCode: z.string().max(40).nullable(),
};

/** POST /api/quote – price + rule check for a work-in-progress booking (no names or contact needed). */
export const quoteRequestSchema = z.object({
  booker: personCoreSchema,
  guests: z.array(personCoreSchema).max(100),
  ...extras,
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const paymentSchema = z.object({ scenario: z.enum(["success", "decline"]) });

/** POST /api/bookings */
export const bookingRequestSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/, "Invalid idempotency key."),
  /** What the person saw. Used ONLY to detect a stale price; never used to charge. */
  expectedTotalCents: z.number().int().min(0),
  booker: personSchema.merge(contactSchema),
  guests: z.array(personSchema).max(100),
  ...extras,
  payment: paymentSchema,
});
export type BookingRequest = z.infer<typeof bookingRequestSchema>;

export function toCart(req: QuoteRequest | BookingRequest): Cart {
  return {
    people: [req.booker, ...req.guests].map((p): PersonCore => ({
      age: p.age,
      ticket: p.ticket,
      dinnerDays: p.dinnerDays,
      workshopDays: p.workshopDays,
    })),
    toddlers: req.toddlers,
    toddlerDinnerDays: req.toddlerDinnerDays ?? [],
    dandiyaPairs: req.dandiyaPairs,
    promoCode: req.promoCode,
  };
}

// ---------- what we store ----------
export const bookingRecordSchema = z.object({
  ref: z.string(),
  status: z.enum(["pending", "confirmed"]),
  idempotencyKey: z.string(),
  createdAt: z.string(),
  contact: identitySchema.merge(contactSchema),
  people: z.array(personSchema),
  toddlers: z.number(),
  toddlerDinnerDays: z.array(z.enum(FESTIVAL_DAYS)).default([]),
  dandiyaPairs: z.number(),
  lines: z.array(
    z.object({
      productId: z.enum(PRODUCT_IDS),
      label: z.string(),
      quantity: z.number(),
      unitCents: z.number(),
      totalCents: z.number(),
    }),
  ),
  promoCode: z.string().nullable(),
  subtotalCents: z.number(),
  discountCents: z.number(),
  totalCents: z.number(),
  paymentRef: z.string().nullable(),
});
export type Booking = z.infer<typeof bookingRecordSchema>;
