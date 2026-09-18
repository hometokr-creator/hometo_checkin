import "server-only";
import { getDb } from "../db";
import { authorize } from "./access";
import { validateSubmission } from "./validation";
import { databaseError } from "./errors";
export async function submitResponse(sessionId: string, input: unknown) {
  const { row, tokenId } = await authorize(sessionId);
  const validated = validateSubmission(input, row);
  const { data, error } = await getDb().rpc("submit_checkin_response", {
    p_session_id: sessionId,
    p_token_id: tokenId,
    p_key: validated.idempotencyKey,
    p_hash: validated.requestHash,
    p_answers: validated.answers,
    p_scenario_id: row.scenario_id,
    p_scenario_version: row.scenario_version,
    p_triage_version: row.triage_rule_version,
  });
  if (error) databaseError(error);
  return { ...data, completionMessage: validated.completionMessage };
}
