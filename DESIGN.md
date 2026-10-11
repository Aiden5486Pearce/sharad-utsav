# Design note (written before coding)

## Modelling
- **Money:** integer cents everywhere. Floats never touch money.
- **Dates:** a closed list of five `YYYY-MM-DD` strings (`FestivalDay`). No timezone maths except "today in Texas" for cut-offs.
- **Tickets:** a union, so impossible states can't be written down: `day{days}` | `allDays` | `family{group, day}`.
- **Adult vs child** is *derived* from age, never chosen by the client.
- **People:** `Cart.people[0]` is the booker (must be 18+); the rest are guests. Under-5s are a count only.
- **Products:** one catalog table keyed by id with `audience: adult | child | null`. Rules look at `audience`/`kind`, never at labels.
- **Stock:** the same quantities that produce the price lines are the quantities decremented. One source of truth.

## Endpoints
- `GET /api/catalog` → prices + live stock
- `POST /api/quote` → rules + price for a draft (so the UI never calculates)
- `POST /api/bookings` → validate, price, reserve stock atomically, pay, confirm (idempotency key + expected total)
- `GET /api/bookings/:ref` → read a confirmation

## Tricky cases spotted so far
Child turning 12 mid-festival · Family Pass composition (3rd child, 3rd adult, multiple passes, cheaper to buy separately) ·
KIDSFREE vs Family Pass vs dinners · FLAT20 on a tiny order · SEVA10 rounding · extras on days you don't attend ·
workshop stock is 2 *person-sessions* and race between two bookers · All-Day Adult sold out reachable by direct API ·
double-click on Pay · payment fails after stock is taken · browser edits the price · days already over · serverless = no shared memory.

## Deliberately not doing (and why)
Real Stripe (time) · email · admin/check-in screen · promo usage counters (needs the same atomic script) · seat holds with expiry
(adds a sweeper) · multiple festivals (note in README).
