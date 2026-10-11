# Sharad Utsav 2026 – Family Booking

**Live site:** https://YOUR-PROJECT.vercel.app  <!-- replace after deploying -->

Event: Radha Krishna Temple, Allen, Texas · Tue 10 – Sat 14 Nov 2026 · USD only.

A booking flow where a family picks tickets, extras and a promo code, pays (simulated), and gets a confirmation.
**The server owns every price, rule and stock count.** The page only displays what the server tells it.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:3000  (uses an in-memory store; resets on restart)
npm test             # Vitest: money, age rules, family pass, stock race, promos, holds, double click
npm run typecheck
npm run build        # same production build Vercel runs
```

## Environment variables (set the same ones in Vercel → Settings → Environment Variables)

| Variable | What it is for |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL. Holds stock, bookings, promo uses, rate limits, pending holds. |
| `UPSTASH_REDIS_REST_TOKEN` | Token for the above. Never commit it. |
| `PAYMENT_MODE` | Reserved. Only `simulated` exists today. |

If Upstash is not configured, **production refuses to take bookings** (it throws) instead of silently using memory.
(The Vercel Marketplace Upstash integration sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`; those names are also accepted.)

### Deploy on Vercel (short path)

1. Push this repo to GitHub (public, or private with `aditirkt` invited).
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Add the Upstash env vars above for **Production**.
4. Deploy, open the production URL, complete a test booking, refresh later and confirm stock still dropped.
5. Paste the production URL at the top of this README and push again.

### Why Upstash and not memory?
Vercel runs the API as serverless functions: each instance has its own memory and dies when idle. An in-memory counter would
reset, and two instances would each sell the "last" workshop place. Stock lives in Redis and every booking is one **atomic Lua
script** (check all items → decrement all → save), so two simultaneous bookings can never both take the last place.

## API contract

All money is **integer cents**. Dates are `YYYY-MM-DD`. Errors always look like `{ "error": { "code", "message", ... } }`.

| Method & path | Purpose | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/catalog` | Prices + live stock | – | `{ event, days, workshopDays, products[{id,label,unit,priceCents,audience,remaining,soldOut}] }` | 500 |
| `POST /api/quote` | Price + rule check of a draft (no names/contact needed) | `QuoteRequest` | `200 { quote, stockProblems[] }` | `400 INVALID_REQUEST`, `422 RULE_VIOLATION` |
| `POST /api/bookings` | Validate → price → reserve stock → pay → confirm | `BookingRequest` | `201 { booking, replayed:false }` (`200 replayed:true` for a repeated idempotency key) | see below |
| `GET /api/bookings/:ref` | Fetch a confirmed booking (ref is random chars) | – | `{ booking }` | `404 NOT_FOUND` |

```ts
type Ticket =
  | { kind: "day"; days: Day[] }                    // ticket product (adult/child) is DERIVED from age
  | { kind: "allDays" }
  | { kind: "family"; group: number; day: Day };    // people sharing `group` share one Family Pass
type PersonCore = { age: number; ticket: Ticket; dinnerDays: Day[]; workshopDays: Day[] };
type QuoteRequest   = {
  booker: PersonCore; guests: PersonCore[];
  toddlers: number; toddlerDinnerDays: Day[]; dandiyaPairs: number; promoCode: string | null
};
type BookingRequest = {
  idempotencyKey: string;               // 16–64 chars [A-Za-z0-9-]; one per "Pay" attempt
  expectedTotalCents: number;           // what the person SAW – only used to detect a stale price, never to charge
  booker: PersonCore & { firstName; lastName; email; phone };
  guests: (PersonCore & { firstName; lastName })[];
  toddlers: number; toddlerDinnerDays: Day[]; dandiyaPairs: number; promoCode: string | null;
  payment: { scenario: "success" | "decline" };   // simulated payment
};
```

`POST /api/bookings` error codes: `400 INVALID_REQUEST` (shape/type), `422 RULE_VIOLATION` (`issues[{path,code,message}]`),
`422 PROMO_REJECTED`, `409 PRICE_CHANGED` (returns the fresh `quote`), `409 SOLD_OUT` (`shortages[]`, nothing charged),
`409 IN_PROGRESS` (same key still processing), `402 PAYMENT_DECLINED` (stock given back), `429 RATE_LIMITED`,
`500 SERVER_ERROR`.
`path` in issues is a field path like `guests.2.age`, so a UI can show the message next to the field.

## Decisions I made
(Each is a situation the brief didn't cover. *Why* is after the dash.)

1. **The person booking is also a visitor** and must hold a ticket – a booker with no ticket is unusual and makes "number of people = number of tickets" ambiguous.
2. **The adult/child ticket is derived from age, not chosen.** The request says "day / all-days / family"; the server picks adult or child from the age. So an adult ticket on a 7-year-old can't even be expressed.
3. **Age is measured on 10 Nov 2026 (first day)** and the form says so. A child who turns 12 on 12 Nov is priced as a child. One simple rule beats per-day pricing.
4. **Under-5s are a headcount, not named people.** No ticket. They **can** buy dinner plates (`toddlerDinnerDays` × headcount) on days someone ticketed in the booking is attending. Workshops stay for ticketed guests only.
5. **Family Pass = 1–2 adults (age 12+) and up to 2 children (5–11), same single day.** A 3rd child buys their own day pass. You may buy several passes (`group` 1, 2, …). It can be pricier than separate tickets for tiny groups, so we allow it but show a warning with the cheaper number.
6. **KIDSFREE only discounts child *entry* tickets** (day/all-day child). Not the Family Pass (a flat bundle), not dinners/workshops. Found by `audience === "child"`, never by matching a ticket's name.
7. **One promo code per booking.** SEVA10 is 10% of the *whole* booking including extras, rounded half-up to the cent. FLAT20 can't push the total below $0. KIDSFREE with no children is rejected as "not applicable" rather than quietly doing nothing.
8. **A bad promo blocks payment** (it is never silently dropped), because the person saw a discount and must knowingly pay the full price.
9. **Limited promo uses live in Redis** and are decremented in the same atomic commit as stock. `MAXEDOUT` seeds at 0 remaining; other codes are unlimited.
10. **Extras only for days you attend.** Dinner (per person, per day) and Garba Workshop need a ticket for that day; workshop only on 11 and 13 Nov.
11. **Garba stock is one pool of 2 *person-sessions*** (brief gave a single number). Stock units: day passes count person-days; all-day and family count passes; dinner person-days.
12. **"Today" is Texas time.** A day can be booked until it ends; the All-Day pass stops being sold once the festival starts (it would be a bad deal and "cannot be changed").
13. **Stale price detection:** the browser sends the total it saw; if the server's own number differs, we return `409 PRICE_CHANGED` instead of charging a surprise.
14. **Order of operations: reserve stock → charge → confirm; on failure release.** Pending holds expire after **15 minutes** and stock (and limited promo uses) are returned by a sweeper on the next store read/commit.
15. **A $0 total skips payment** (e.g. a promo that covers everything).
16. **Booking attempts are rate-limited** (20 / IP / minute) so a stranger can't hammer stock.
17. **Colours:** brand red `#EF1F1F` is 3.25:1 on the dark background and fails WCAG AA for text, so it's used for borders; message text uses `#FF8A8A` (6.2:1). Same idea for success green.

## Not finished / limitations (stated plainly)
- **Payment is simulated.** No Stripe test mode yet. The server-side seam is `src/server/payment.ts`.
- **No confirmation email** and no volunteer check-in screen / admin list. Bookings are stored and fetchable by reference.
- **No duplicate-person detection** across bookings.
- After deploy, please do a quick pass on a real phone before you submit the recording.

## If this had to run ten festivals with ten rule sets
Move products, prices, days, promos and limits into per-event *data* (an `EventConfig` selected by id; Redis keys prefixed by
event id) and turn each rule in `src/domain/validate.ts` into a small named function in a list the config can switch on/off.
The pricing function already takes everything it needs as arguments, so it would not change.

## Project map
`src/domain/*` pure business rules (no HTTP, no React) · `src/server/*` API plumbing, stores, payment · `src/app/api/*` thin route handlers ·
`src/lib/*` client state/reducer/API client · `src/components/*` UI · `tests/*` Vitest.
