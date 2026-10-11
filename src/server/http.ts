import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { STATUS_FOR, type ApiError, type FieldIssue } from "./errors";

export const errorResponse = (error: ApiError) => NextResponse.json({ error }, { status: STATUS_FOR[error.code] });

export function zodIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export const invalidRequest = (error: ZodError) =>
  errorResponse({ code: "INVALID_REQUEST", message: "Some details are missing or not valid.", issues: zodIssues(error) });

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export const serverError = () =>
  errorResponse({ code: "SERVER_ERROR", message: "Something went wrong on our side. Nothing has been charged. Please try again." });
