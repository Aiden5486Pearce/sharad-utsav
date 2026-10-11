import { forEachProduct, isLimitedPromo, limitedPromoInitialUses, PRODUCT_IDS, PRODUCTS, type ProductId } from "@/domain/catalog";
import { demandEntries, type Demand } from "@/domain/pricing";
import { normalisePromoCode } from "@/domain/promo";
import { z } from "zod";
import { bookingRecordSchema, type Booking } from "../schemas";
import { demandFromBooking, type BookingStore, type CommitResult, type StockLevels } from "./types";

/** Sends one Redis command. Production uses Upstash's REST API; tests can pass a fake. */
export type RedisExec = (command: (string | number)[]) => Promise<unknown>;

export function upstashExec(url: string, token: string): RedisExec {
  return async (command) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    const body: unknown = await res.json();
    const parsed = z.object({ result: z.unknown().optional(), error: z.string().optional() }).parse(body);
    if (parsed.error) throw new Error(`Redis error: ${parsed.error}`);
    return parsed.result;
  };
}

const stockKey = (id: ProductId) => `su26:stock:${id}`;
const bookingKey = (ref: string) => `su26:booking:${ref}`;
const idemKey = (key: string) => `su26:idem:${key}`;
const promoKey = (code: string) => `su26:promo:${code}`;
const HOLDS_KEY = "su26:holds";
const rateKey = (bucket: string) => `su26:rl:${bucket}`;

/*
 * Lua runs as ONE atomic step inside Redis: no other request can run in the middle.
 * That is what stops two people both getting the last Garba Workshop place, and what
 * keeps a limited promo from being over-used.
 *
 * KEYS[1]=idempotency, KEYS[2]=booking, KEYS[3]=holds zset, KEYS[4]=promo (may be unused),
 * KEYS[5..]=stock keys
 * ARGV[1]=booking JSON, ARGV[2]=ref, ARGV[3]=holdUntilMs, ARGV[4]=promoMode (0|1),
 * ARGV[5]=promoInitial, ARGV[6]=N, then N triples: productId, initialStock, quantity
 */
const COMMIT_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then return cjson.encode({status='duplicate', booking=existing}) end
local promoMode = tonumber(ARGV[4])
if promoMode == 1 then
  redis.call('SETNX', KEYS[4], ARGV[5])
  local have = tonumber(redis.call('GET', KEYS[4]))
  if have < 1 then return cjson.encode({status='promo_exhausted'}) end
end
local n = tonumber(ARGV[6])
local short = {}
for i = 1, n do
  local base = 7 + (i - 1) * 3
  redis.call('SETNX', KEYS[4 + i], ARGV[base + 1])
  local have = tonumber(redis.call('GET', KEYS[4 + i]))
  local want = tonumber(ARGV[base + 2])
  if have < want then table.insert(short, {productId=ARGV[base], requested=want, available=have}) end
end
if #short > 0 then return cjson.encode({status='insufficient', shortages=short}) end
for i = 1, n do
  redis.call('DECRBY', KEYS[4 + i], tonumber(ARGV[7 + (i - 1) * 3 + 2]))
end
if promoMode == 1 then redis.call('DECR', KEYS[4]) end
redis.call('SET', KEYS[2], ARGV[1])
redis.call('SET', KEYS[1], ARGV[1])
redis.call('ZADD', KEYS[3], tonumber(ARGV[3]), ARGV[2])
return cjson.encode({status='committed'})
`;

/** KEYS[1]=booking, KEYS[2]=idem, KEYS[3]=holds, KEYS[4]=promo, KEYS[5..]=stock.
 * ARGV[1]=ref, ARGV[2]=promoMode, ARGV[3]=N, ARGV[4..]=quantities */
const RELEASE_SCRIPT = `
if redis.call('DEL', KEYS[1]) == 0 then return 0 end
redis.call('DEL', KEYS[2])
redis.call('ZREM', KEYS[3], ARGV[1])
if tonumber(ARGV[2]) == 1 then redis.call('INCR', KEYS[4]) end
for i = 1, tonumber(ARGV[3]) do
  redis.call('INCRBY', KEYS[4 + i], tonumber(ARGV[3 + i]))
end
return 1
`;

const SAVE_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1]);
redis.call('SET', KEYS[2], ARGV[1]);
redis.call('ZREM', KEYS[3], ARGV[2]);
return 1
`;

const commitReply = z.discriminatedUnion("status", [
  z.object({ status: z.literal("committed") }),
  z.object({ status: z.literal("duplicate"), booking: z.string() }),
  z.object({ status: z.literal("promo_exhausted") }),
  z.object({
    status: z.literal("insufficient"),
    shortages: z.array(z.object({ productId: z.enum(PRODUCT_IDS), requested: z.number(), available: z.number() })),
  }),
]);

export class UpstashStore implements BookingStore {
  constructor(private readonly exec: RedisExec) {}

  async getStock(): Promise<StockLevels> {
    await this.sweepExpiredHolds(Date.now());
    const raw = await this.exec(["MGET", ...PRODUCT_IDS.map(stockKey)]);
    const values = z.array(z.string().nullable()).parse(raw);
    const stored = new Map(PRODUCT_IDS.map((id, i) => [id, values[i]]));
    return forEachProduct((id) => {
      const v = stored.get(id);
      return v == null ? PRODUCTS[id].initialStock : Number(v);
    });
  }

  async getPromoRemaining(code: string): Promise<number | null> {
    const normalised = normalisePromoCode(code);
    if (!isLimitedPromo(normalised)) return null;
    const initial = limitedPromoInitialUses(normalised) ?? 0;
    const raw = await this.exec(["GET", promoKey(normalised)]);
    if (raw == null) return initial;
    return Number(z.string().parse(raw));
  }

  async commit(booking: Booking, demand: Demand, holdUntilMs: number): Promise<CommitResult> {
    await this.sweepExpiredHolds(Date.now());
    const entries = demandEntries(demand);
    const limited = booking.promoCode != null && isLimitedPromo(booking.promoCode);
    const code = limited ? normalisePromoCode(booking.promoCode!) : "NONE";
    const initial = limited ? (limitedPromoInitialUses(code) ?? 0) : 0;
    const reply = await this.exec([
      "EVAL", COMMIT_SCRIPT, 4 + entries.length,
      idemKey(booking.idempotencyKey), bookingKey(booking.ref), HOLDS_KEY, promoKey(code),
      ...entries.map(([id]) => stockKey(id)),
      JSON.stringify(booking), booking.ref, holdUntilMs, limited ? 1 : 0, initial, entries.length,
      ...entries.flatMap(([id, qty]) => [id, PRODUCTS[id].initialStock, qty]),
    ]);
    const parsed = commitReply.parse(JSON.parse(z.string().parse(reply)));
    if (parsed.status === "duplicate") return { status: "duplicate", booking: bookingRecordSchema.parse(JSON.parse(parsed.booking)) };
    return parsed;
  }

  async markConfirmed(booking: Booking): Promise<void> {
    await this.exec([
      "EVAL", SAVE_SCRIPT, 3,
      bookingKey(booking.ref), idemKey(booking.idempotencyKey), HOLDS_KEY,
      JSON.stringify(booking), booking.ref,
    ]);
  }

  async release(booking: Booking, demand: Demand): Promise<void> {
    const entries = demandEntries(demand);
    const limited = booking.promoCode != null && isLimitedPromo(booking.promoCode);
    const code = limited ? normalisePromoCode(booking.promoCode!) : "NONE";
    await this.exec([
      "EVAL", RELEASE_SCRIPT, 4 + entries.length,
      bookingKey(booking.ref), idemKey(booking.idempotencyKey), HOLDS_KEY, promoKey(code),
      ...entries.map(([id]) => stockKey(id)),
      booking.ref, limited ? 1 : 0, entries.length, ...entries.map(([, qty]) => qty),
    ]);
  }

  async getBooking(ref: string): Promise<Booking | null> {
    await this.sweepExpiredHolds(Date.now());
    const raw = await this.exec(["GET", bookingKey(ref)]);
    return raw == null ? null : bookingRecordSchema.parse(JSON.parse(z.string().parse(raw)));
  }

  async sweepExpiredHolds(nowMs: number): Promise<number> {
    const raw = await this.exec(["ZRANGEBYSCORE", HOLDS_KEY, "-inf", nowMs]);
    const refs = z.array(z.string()).parse(raw);
    let released = 0;
    for (const ref of refs) {
      const booking = await this.getBookingRaw(ref);
      if (!booking) {
        await this.exec(["ZREM", HOLDS_KEY, ref]);
        continue;
      }
      if (booking.status !== "pending") {
        await this.exec(["ZREM", HOLDS_KEY, booking.ref]);
        continue;
      }
      await this.release(booking, demandFromBooking(booking));
      released += 1;
    }
    return released;
  }

  private async getBookingRaw(ref: string): Promise<Booking | null> {
    const raw = await this.exec(["GET", bookingKey(ref)]);
    return raw == null ? null : bookingRecordSchema.parse(JSON.parse(z.string().parse(raw)));
  }

  async hitRateLimit(bucket: string, windowSec: number): Promise<number> {
    const key = rateKey(bucket);
    const count = Number(z.union([z.string(), z.number()]).parse(await this.exec(["INCR", key])));
    if (count === 1) await this.exec(["EXPIRE", key, windowSec]);
    return count;
  }
}
