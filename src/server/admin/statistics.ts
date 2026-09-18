import "server-only";
import { requireAdmin } from "./session";
import { getDb } from "../db";
import { readAllRows } from "./responses";
import { adminScenario, questionLabel } from "./scenario-labels";
import { initiallyPositive, regularRound } from "./response-records";
import { ADMIN_ROUNDS, type AdminTag } from "@/domains/admin-responses/model";
import { buildStatsData, parseStatsFilters, type StatsSession, type StatsPageData } from "@/domains/admin-responses/statistics";
import { getCheckinDetailOptions } from "@/domains/checkin/model/checkin-options";
import type { SessionRow } from "../checkin/scenario-registry";

export interface StatsRecord extends SessionRow {
  deliveries: { kind: string; status: string; sent_at: string | null }[];
  progress: { step_id: string; reached_at: string }[];
  response: { submitted_at: string; outcome: string; scenario_id: string; scenario_version: number; answers_json: { responses?: Record<string, string> };
    issues: { tag: AdminTag; detail: string | null; free_text: string | null }[] } | null;
  interests: { experiment_key: string; exposed_at: string | null; clicked_at: string | null; topics_submitted_at: string | null; topics: string[] }[];
}
export const STATS_SELECT = `id,participant_id,persona_type,round_type,round_key,scenario_id,scenario_version,triage_rule_version,event_type,event_context_snapshot,status,answer_expires_at,
  deliveries:checkin_delivery(kind,status,sent_at),progress:checkin_progress_event(step_id,reached_at),
  response:checkin_response(submitted_at,outcome,scenario_id,scenario_version,answers_json,issues:checkin_issue(tag,detail,free_text)),
  interests:checkin_interest(experiment_key,exposed_at,clicked_at,topics_submitted_at,topics)`;
export function mapStatsSession(row: StatsRecord): StatsSession | null {
  if (!regularRound(row.round_type) || row.status === "cancelled") return null;
  const scenario = adminScenario(row);
  const compatible = !!scenario && (!row.response || (row.response.scenario_id === scenario.id && row.response.scenario_version === row.scenario_version));
  const answers = row.response?.answers_json.responses ?? {};
  const textAnswers = compatible ? [...new Set(Object.values(scenario!.steps).filter((step) => step.control.kind === "text").map((step) => step.answerKey))].map((key) => answers[key]) : [];
  const interest = row.interests.find((i) => i.experiment_key === "community-interest:v1");
  return {
    id: row.id, participantId: row.participant_id, round: row.round_type, status: row.status, expiresAt: row.answer_expires_at,
    deliveries: row.deliveries.map((d) => ({ kind: d.kind, status: d.status, sentAt: d.sent_at })),
    progress: row.progress.map((p) => {
      const step = scenario?.steps[p.step_id];
      return { key: `${row.scenario_id}:${p.step_id}`, label: questionLabel(step), at: p.reached_at,
        stage: !step ? "unknown" : p.step_id === scenario!.entry ? "entry" : step.control.kind,
        urgent: step?.control.kind === "chips" && step.answerKey === "urgentDetail" };
    }),
    response: row.response ? {
      at: row.response.submitted_at, outcome: row.response.outcome, positive: compatible ? initiallyPositive(row.round_type, answers) : null,
      textAnswered: textAnswers.some((v) => v === "provided" || v === "skipped"), textProvided: textAnswers.includes("provided"),
      issues: row.response.issues.map((i) => ({ tag: i.tag, hasText: !!i.free_text?.trim(),
        detail: i.detail ? (compatible ? getCheckinDetailOptions(i.tag).find((d) => d.value === i.detail)?.label : null) ?? "선택 내용 확인 불가" : null })),
    } : null,
    interest: interest ? { exposedAt: interest.exposed_at, clickedAt: interest.clicked_at, submittedAt: interest.topics_submitted_at, topics: interest.topics } : null,
  };
}
export type StatsResult = { ok: true; data: StatsPageData } | { ok: false; reason: "filters" | "unavailable" };
export async function loadAdminStats(params: Record<string, string | string[] | undefined>): Promise<StatsResult> {
  await requireAdmin();
  const now = new Date().toISOString(), filters = parseStatsFilters(params, now);
  if (!filters) return { ok: false, reason: "filters" };
  try {
    const db = getDb();
    const rows = await readAllRows<StatsRecord>((from, to) => db.from("checkin_session").select(STATS_SELECT)
      .in("round_type", Object.keys(ADMIN_ROUNDS)).neq("status", "cancelled").order("id").range(from, to));
    return { ok: true, data: buildStatsData(rows.map(mapStatsSession).filter((s) => s !== null), filters, now) };
  } catch { return { ok: false, reason: "unavailable" }; }
}
