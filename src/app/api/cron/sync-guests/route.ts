import { timingSafeEqual } from "node:crypto";
import { GuestSyncError } from "@/server/checkin/guest-sync-plan";
import { syncGuestSheet } from "@/server/checkin/guest-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || Buffer.byteLength(secret) < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (process.env.CHECKIN_GUEST_SYNC_ENABLED !== "true") {
    return Response.json({ error: "GUEST_SYNC_DISABLED" }, { status: 503 });
  }
  try {
    return Response.json(await syncGuestSheet(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof GuestSyncError ? error.code : "GUEST_SYNC_FAILED" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
