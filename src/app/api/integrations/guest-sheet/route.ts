import { timingSafeEqual } from "node:crypto";
import { assertLiveGuestSyncTarget } from "@/server/checkin/guest-sheet";
import { GuestSyncError, planGuestSync, type GuestSheetSnapshot } from "@/server/checkin/guest-sync-plan";
import { persistGuestSnapshot } from "@/server/checkin/guest-sync";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BYTES = 2_000_000;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const secret = process.env.CHECKIN_GUEST_SYNC_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || Buffer.byteLength(secret) < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return reply({ error: "UNAUTHORIZED" }, 401);
  }
  if (process.env.CHECKIN_GUEST_SYNC_ENABLED !== "true") return reply({ error: "GUEST_SYNC_DISABLED" }, 503);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply({ error: "JSON_REQUIRED" }, 415);
  try {
    assertLiveGuestSyncTarget();
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "INVALID_REQUEST" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return reply({ error: "PAYLOAD_TOO_LARGE" }, 413); }
      chunks.push(value);
    }
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return reply({ error: "INVALID_JSON" }, 400); }
    const snapshot = input?.snapshot;
    if (!snapshot || typeof snapshot !== "object" || typeof snapshot.readAt !== "string" ||
        !Array.isArray(snapshot.values) || snapshot.values.some((row: unknown) => !Array.isArray(row) ||
          row.some((cell: unknown) => typeof cell !== "string")) ||
        typeof input.runId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.runId) ||
        typeof input.dryRun !== "boolean") return reply({ error: "INVALID_REQUEST" }, 400);
    const readTime = Date.parse(snapshot.readAt);
    if (!Number.isFinite(readTime) || readTime > Date.now() + 300_000 || readTime < Date.now() - 900_000) {
      return reply({ error: "STALE_SNAPSHOT" }, 400);
    }
    const plan = planGuestSync(snapshot as GuestSheetSnapshot);
    if (input.dryRun) return reply({ dryRun: true, complete: plan.complete, incomplete: plan.incomplete, skippedRows: plan.skippedRows });
    return reply(await persistGuestSnapshot(snapshot, input.runId));
  } catch (error) {
    return reply({ error: error instanceof GuestSyncError ? error.code : "GUEST_SYNC_FAILED" }, 503);
  }
}
