import { MemoryStore } from "./memory";
import type { BookingStore } from "./types";
import { UpstashStore, upstashExec } from "./upstash";

declare global {
  var __bookingStore: BookingStore | undefined;
}

/**
 * Production MUST have Upstash configured: serverless functions don't share memory, so an
 * in-memory store would silently sell the same stock many times over.
 */
export function getStore(): BookingStore {
  if (globalThis.__bookingStore) return globalThis.__bookingStore;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (url && token) {
    globalThis.__bookingStore = new UpstashStore(upstashExec(url, token));
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("Storage is not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  } else {
    console.warn("[store] No Upstash env vars: using an in-memory store (local development only).");
    globalThis.__bookingStore = new MemoryStore();
  }
  return globalThis.__bookingStore;
}
