import "server-only";
import { getDb } from "../db";
import { requireAdmin } from "./session";
import { ADMIN_ROUNDS, type AdminInboxData } from "@/domains/admin-responses/model";
import { mapResponse, mapUrgent, type ResponseRecord, type UrgentRecord } from "./response-records";

const SESSION_FIELDS = "id,participant_id,persona_type,round_type,round_key,scenario_id,scenario_version,triage_rule_version,event_type,event_context_snapshot,status,answer_expires_at";
export const RESPONSE_SELECT = `id,session_id,outcome,submitted_at,reviewed_at,answers_json,scenario_id,scenario_version,
  issues:checkin_issue(id,tag,detail,free_text),
  session:checkin_session!inner(${SESSION_FIELDS},
    participant:checkin_participant!inner(id,display_name,phone,property_label,host_name,contract_start_date,contract_end_date),
    interests:checkin_interest(experiment_key,exposed_at,clicked_at,topics_submitted_at,topics))`;
export const URGENT_SELECT = `session_id,reached_at,session:checkin_session!inner(${SESSION_FIELDS},
  participant:checkin_participant!inner(display_name,property_label),response:checkin_response(id))`;
export class AdminReadError extends Error {
  constructor(public reason: "setup" | "unavailable") { super(reason); }
}
export async function readAllRows<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { code?: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await read(rows.length, rows.length + 499);
    if (error) throw new AdminReadError(["42703", "PGRST204", "PGRST202"].includes(error.code ?? "") ? "setup" : "unavailable");
    if (!data) throw new AdminReadError("unavailable");
    if (!data.length) return rows;
    rows.push(...data as T[]);
  }
}
export type InboxResult = { ok: true; data: AdminInboxData } | { ok: false; reason: "setup" | "unavailable" };
export async function loadAdminResponses(): Promise<InboxResult> {
  await requireAdmin();
  try {
    const db = getDb();
    const [records, pending] = await Promise.all([
      readAllRows<ResponseRecord>((from, to) => db.from("checkin_response").select(RESPONSE_SELECT)
        .in("session.round_type", Object.keys(ADMIN_ROUNDS)).neq("session.status", "cancelled")
        .order("id").range(from, to)),
      readAllRows<UrgentRecord>((from, to) => db.from("checkin_progress_event").select(URGENT_SELECT)
        .eq("step_id", "q_chip_urgent").in("session.round_type", Object.keys(ADMIN_ROUNDS))
        .eq("session.status", "open").order("id").range(from, to)),
    ]);
    return { ok: true, data: {
      responses: records.map(mapResponse).filter((r) => r !== null),
      urgentPending: pending.map(mapUrgent).filter((r) => r !== null).sort((a, b) => Date.parse(b.reachedAt) - Date.parse(a.reachedAt)),
      now: new Date().toISOString(),
    } };
  } catch (error) {
    return { ok: false, reason: error instanceof AdminReadError ? error.reason : "unavailable" };
  }
}
