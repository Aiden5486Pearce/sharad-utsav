# My edge cases and what the app does

Legend: ✅ covered by an automated test · 🖐 checked by hand through the API/UI · ⚠ known gap

## Age
| Case | Behaviour |
| --- | --- |
| Booker age 17 / 18 | 17 → "must be 18 or older"; 18 OK ✅ |
| Guest age 4 with a ticket | Rejected, points to the "under 5" box ✅ |
| Age 4/5/11/12 boundaries | toddler / child / child / adult ✅ |
| Age `-5`, `7.5`, `999`, `"abc"`, empty, `"7"` (string) | Rejected with "whole number between 0 and 120" ✅ |
| Adult-priced ticket for a 7-year-old via direct API | Impossible – product is derived from age ✅ |
| Child turns 12 during the festival | Priced by age on 10 Nov (documented) |

## Tickets & days
| Case | Behaviour |
| --- | --- |
| Day pass with no days / same day twice | "Choose at least one day" / "once only" ✅ |
| All-Day Adult (0 left) | Option disabled on page; banner shown; direct API → `409 SOLD_OUT` ✅🖐 |
| Family pass with 3 adults / 3 children / no adult / different days | Each rejected with its own message ✅ |
| 12-year-old on a Family Pass | Counts as an adult ✅ |
| Family Pass cheaper separately | Allowed, warning shown ✅ |
| Booking a day that has already ended / All-Day after start | Rejected ✅ |
| 11pm 9 Nov in Texas (already 10 Nov UTC) | Still "before festival" ✅ |

## Extras
| Case | Behaviour |
| --- | --- |
| Dinner/workshop for a day not attended | Rejected; UI greys the day out; changing the ticket removes stale extras ✅ |
| Workshop on 12 Nov | Rejected ✅ |
| Last 2 workshop places, two bookers at once | Exactly one succeeds ✅🖐 |
| 1 place wanted when 0 left | Whole booking refused, no partial stock taken ✅ |
| 31 pairs of sticks, 21 people, 11 toddlers | Rejected by limits ✅ |
| Toddler dinner plates | Charged toddlers × days; day must be attended by someone ticketed ✅ |
| Toddler dinner with 0 toddlers | Rejected ✅ |

## Promo codes
| Case | Behaviour |
| --- | --- |
| SEVA10 / FLAT20 / KIDSFREE | 10% of whole / $20 off (never below $0) / children's tickets free ✅ |
| `seva10 ` (lowercase, spaces) | Works ✅ |
| EXPIRED5 / MAXEDOUT / `HELLO` | Three different messages; Pay is blocked until removed ✅ |
| Limited promo use counter | Decremented atomically with stock; next use blocked at 0 ✅ |
| KIDSFREE with no children | "only discounts child tickets" |
| Two codes at once | Not possible – one field |

## Money & safety
| Case | Behaviour |
| --- | --- |
| Browser sends total `$1` | `409 PRICE_CHANGED` with the real quote ✅🖐 |
| Double-click Pay / retry after lost connection | Same idempotency key → one booking, one stock decrement ✅🖐 |
| Card declined | Stock returned, can retry with same key ✅🖐 |
| Payment service throws | Stock returned, "you have not been charged" ✅ |
| Pending hold expires (15 min) | Stock (and limited promo) released by sweeper ✅ |
| Too many booking POSTs | `429 RATE_LIMITED` |
| Total with floats (`146.7000…`) | Impossible – integer cents ✅ |
| Production without database configured | Booking refuses to run (never silent memory) |

## Known gaps ⚠
No Stripe · no confirmation email · no duplicate-person detection across bookings.
