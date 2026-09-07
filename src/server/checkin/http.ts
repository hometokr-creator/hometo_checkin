import "server-only";
import { NextResponse } from "next/server";
import { accessEnvironment } from "../env";
import { CheckinError } from "./errors";
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" } });
}
export function failure(error: unknown) {
  // Never log request bodies, URLs, cookies, Supabase errors or free text.
  if (error instanceof CheckinError) return json({ code: error.code }, error.status);
  return json({ code: "unavailable" }, 503);
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CheckinError("invalid-answer", 422);
  return value as Record<string, unknown>;
}
export function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new CheckinError("invalid-answer", 422);
}
export async function body(request: Request, limit = 16000) {
  if (request.headers.get("origin") !== accessEnvironment().origin) throw new CheckinError("invalid", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new CheckinError("invalid-answer", 415);
  if (Number(request.headers.get("content-length")) > limit) throw new CheckinError("invalid-answer", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new CheckinError("invalid-answer", 422);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>limit) { await reader.cancel(); throw new CheckinError("invalid-answer",413); } chunks.push(value); }
    return object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch(e) { if(e instanceof CheckinError) throw e; throw new CheckinError("invalid-answer",422); }
}
export function uuid(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new CheckinError("invalid", 400);
}
