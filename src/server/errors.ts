import type { RuleIssue } from "@/domain/types";
import type { Quote } from "@/domain/types";
import type { Shortage } from "./store/types";

export type ApiError =
  | { code: "INVALID_REQUEST"; message: string; issues: FieldIssue[] }
  | { code: "RULE_VIOLATION"; message: string; issues: RuleIssue[] }
  | { code: "PROMO_REJECTED"; message: string; issues: FieldIssue[] }
  | { code: "PRICE_CHANGED"; message: string; quote: Quote }
  | { code: "SOLD_OUT"; message: string; shortages: (Shortage & { label: string })[] }
  | { code: "PAYMENT_DECLINED"; message: string }
  | { code: "IN_PROGRESS"; message: string }
  | { code: "NOT_FOUND"; message: string }
  | { code: "RATE_LIMITED"; message: string }
  | { code: "SERVER_ERROR"; message: string };

export interface FieldIssue {
  path: string;
  message: string;
}

export const STATUS_FOR: Record<ApiError["code"], number> = {
  INVALID_REQUEST: 400,
  RULE_VIOLATION: 422,
  PROMO_REJECTED: 422,
  PRICE_CHANGED: 409,
  SOLD_OUT: 409,
  PAYMENT_DECLINED: 402,
  IN_PROGRESS: 409,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
};
