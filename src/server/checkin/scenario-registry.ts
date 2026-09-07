import "server-only";
import type { CheckinSession, EventContext, RoundType } from "@/domains/checkin/model/checkin";
import { selectGuestScenario } from "@/features/run-checkin/model/scenarios/select-guest-scenario";
import { CheckinError } from "./errors";
export interface SessionRow {
 id: string; participant_id: string; persona_type: string; round_type: string; round_key: string;
 scenario_id: string; scenario_version: number; triage_rule_version: number; event_type: string | null;
 event_context_snapshot: unknown; status: string; answer_expires_at: string;
}
const rounds = ["onboarding-d7", "monthly", "monthly-first", "monthly-renewal", "event"];
export function sessionDto(row: SessionRow, displayName?: string): CheckinSession {
 if(row.persona_type!=="guest" || !rounds.includes(row.round_type) || row.scenario_version!==1 || row.triage_rule_version!==1) throw new CheckinError("unsupported",422);
 let eventContext: EventContext | undefined;
 if(row.round_type==="event") {
   const ctx=row.event_context_snapshot as Partial<EventContext> | null;
   if(row.event_type==="rule" && ctx?.type==="rule") eventContext={type:"rule"};
   else if(row.event_type==="facility" && ctx?.type==="facility" && typeof ctx.itemName==="string" && ctx.itemName.trim()) eventContext={type:"facility",itemName:ctx.itemName};
   else throw new CheckinError("unsupported",422);
 }
 const session: CheckinSession={id:row.id,personaType:"guest",roundType:row.round_type as RoundType,displayName,eventContext,scenarioId:row.scenario_id,scenarioVersion:row.scenario_version};
 if(selectGuestScenario(session).id!==row.scenario_id) throw new CheckinError("unsupported",422);
 return session;
}
export function pinnedScenario(row: SessionRow) { return selectGuestScenario(sessionDto(row)); }
