import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import { GuestSyncError, planGuestSync, type GuestSheetSnapshot } from "./guest-sync-plan";
import { readGuestSheet } from "./guest-sheet";

export async function persistGuestSnapshot(snapshot: GuestSheetSnapshot, runId = randomUUID()) {
  const plan = planGuestSync(snapshot);
  const { data, error } = await getDb().rpc("sync_checkin_guests", {
    p_guests: plan.guests, p_source_read_at: plan.readAt,
    p_run_id: runId, p_skipped_count: plan.skippedRows,
  });
  if (error) throw new GuestSyncError("GUEST_DATABASE_SYNC_FAILED");
  return { runId, summary: data };
}

export async function syncGuestSheet() {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  try {
    return await persistGuestSnapshot(await readGuestSheet(), runId);
  } catch (error) {
    const code = error instanceof GuestSyncError ? error.code : "GUEST_SYNC_FAILED";
    // Only bounded error codes and counts are retained, never rows or upstream errors.
    try {
      await getDb().from("checkin_guest_sync_run").insert({
        run_id: runId, source_read_at: startedAt, status: "failed", error_code: code,
      });
    } catch { /* The database may also be unavailable. The route returns a safe error. */ }
    throw new GuestSyncError(code);
  }
}
