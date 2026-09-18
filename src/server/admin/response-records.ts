import "server-only";
import type { SessionRow } from "../checkin/scenario-registry";
import { pinnedScenario } from "../checkin/scenario-registry";
import { adminScenario, timelineForResponse } from "./scenario-labels";
import { getCheckinDetailOptions } from "@/domains/checkin/model/checkin-options";
import { ADMIN_ROUNDS, ADMIN_TAGS, ADMIN_TOPICS, type AdminResponse, type AdminUrgentPending, type AdminParticipant, type AdminRound, type AdminTag } from "@/domains/admin-responses/model";

export interface ParticipantRecord {
  guest_id?: string | null;
  id: string; display_name: string; phone: string; property_label: string | null; host_name: string | null;
  contract_start_date: string; contract_end_date: string;
}
export interface ResponseRecord {
  id: string; session_id: string; outcome: AdminResponse["outcome"]; submitted_at: string; reviewed_at: string | null;
  answers_json: { responses?: Record<string, string> }; scenario_id: string; scenario_version: number;
  session: SessionRow & { participant: ParticipantRecord; interests: InterestRecord[]; progress?: { step_id: string; reached_at: string }[] };
  issues: { id: string; tag: AdminTag; detail: string | null; free_text: string | null }[];
}
interface InterestRecord { experiment_key: string; exposed_at: string | null; clicked_at: string | null; topics_submitted_at: string | null; topics: string[] }
export interface UrgentRecord {
  session_id: string; reached_at: string;
  session: SessionRow & { participant: Pick<ParticipantRecord, "display_name" | "property_label">; response: { id: string } | null };
}
export function regularRound(value: string): value is AdminRound { return Object.hasOwn(ADMIN_ROUNDS, value); }
function participant(record: ParticipantRecord): AdminParticipant {
  return { id: record.id, guestId: record.guest_id ?? null, name: record.display_name, phone: record.phone, property: record.property_label, host: record.host_name, contractStart: record.contract_start_date, contractEnd: record.contract_end_date };
}
export function initiallyPositive(round: AdminRound, responses: Record<string, string>) {
  const definitions = { "onboarding-d7": ["onboardingStatus", "ok"], "monthly-first": ["firstMonthStatus", "ok"], monthly: ["monthlyStatus", "ok"], "monthly-renewal": ["renewalSupportStatus", "none"] } as const;
  const [key, value] = definitions[round];
  return responses[key] === value;
}
export function mapResponse(record: ResponseRecord): AdminResponse | null {
  if (!regularRound(record.session.round_type) || record.session.status === "cancelled") return null;
  let labelsAvailable = false;
  try {
    const scenario = pinnedScenario(record.session);
    labelsAvailable = scenario.id === record.scenario_id && record.scenario_version === record.session.scenario_version;
  } catch { /* Unsupported historical versions keep the original text, not guessed labels. */ }
  const interest = record.session.interests.find((item) => item.experiment_key === "community-interest:v1");
  const timeline = timelineForResponse(labelsAvailable ? adminScenario(record.session) : null, record.session.progress ?? [], record.answers_json.responses ?? {}, record.issues, record.session.participant.display_name);
  const elapsed = timeline.length ? (Date.parse(record.submitted_at) - Date.parse(timeline[0].at)) / 1000 : null;
  return {
    id: record.id, sessionId: record.session_id, participant: participant(record.session.participant), round: record.session.round_type,
    outcome: record.outcome, submittedAt: record.submitted_at, reviewedAt: record.reviewed_at, labelsAvailable,
    timeline, durationSeconds: elapsed !== null && elapsed >= 0 && Number.isFinite(elapsed) ? elapsed : null,
    initiallyPositive: labelsAvailable && initiallyPositive(record.session.round_type, record.answers_json.responses ?? {}),
    issues: record.issues.map((issue) => {
      if (!Object.hasOwn(ADMIN_TAGS, issue.tag)) throw new Error("Unsupported issue tag");
      return { id: issue.id, tag: issue.tag, freeText: issue.free_text,
        detailLabel: issue.detail ? (labelsAvailable ? getCheckinDetailOptions(issue.tag).find((option) => option.value === issue.detail)?.label : null) ?? "선택 내용 확인 불가" : null };
    }),
    interest: interest ? {
      exposed: !!interest.exposed_at, clicked: !!interest.clicked_at, topicsSubmitted: !!interest.topics_submitted_at,
      topics: interest.topics.map((topic) => Object.hasOwn(ADMIN_TOPICS, topic) ? ADMIN_TOPICS[topic as keyof typeof ADMIN_TOPICS] : "선택 내용 확인 불가"),
    } : null,
  };
}
export function mapUrgent(record: UrgentRecord): AdminUrgentPending | null {
  if (!regularRound(record.session.round_type) || record.session.status !== "open" || record.session.response) return null;
  return { sessionId: record.session_id, name: record.session.participant.display_name, property: record.session.participant.property_label,
    round: record.session.round_type, reachedAt: record.reached_at, expiresAt: record.session.answer_expires_at };
}
