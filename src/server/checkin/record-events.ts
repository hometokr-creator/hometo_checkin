import "server-only";
import { getDb } from "../db";
import { authorize } from "./access";
import { object, keys } from "./http";
import { CheckinError, databaseError } from "./errors";
import { pinnedScenario } from "./scenario-registry";
import { CHECKIN_INTEREST_TOPICS } from "@/domains/checkin/model/checkin-interest";
export function validateInterest(value: unknown) {
  const input = object(value);
  keys(
    input,
    input.type === "topics-submitted" ? ["type", "topics"] : ["type"],
  );
  if (
    !["exposed", "clicked", "topics-submitted"].includes(input.type as string)
  )
    throw new CheckinError("invalid-answer", 422);
  const topics = input.type === "topics-submitted" ? input.topics : [];
  if (
    !Array.isArray(topics) ||
    topics.length > 6 ||
    new Set(topics).size !== topics.length ||
    !topics.every((t) =>
      CHECKIN_INTEREST_TOPICS.some((option) => option.value === t),
    )
  )
    throw new CheckinError("invalid-answer", 422);
  return { type: input.type as string, topics: topics as string[] };
}
export async function recordInterest(sessionId: string, value: unknown) {
  const { tokenId } = await authorize(sessionId);
  const input = validateInterest(value);
  const { data, error } = await getDb().rpc("record_checkin_interest", {
    p_session_id: sessionId,
    p_token_id: tokenId,
    p_type: input.type,
    p_topics: input.topics,
  });
  if (error) databaseError(error);
  return data;
}
export async function recordProgress(sessionId: string, value: unknown) {
  const { row, tokenId } = await authorize(sessionId);
  const input = object(value);
  keys(input, ["scenarioId", "stepId"]);
  const scenario = pinnedScenario(row);
  if (
    input.scenarioId !== scenario.id ||
    typeof input.stepId !== "string" ||
    !Object.hasOwn(scenario.steps, input.stepId)
  )
    throw new CheckinError("invalid-answer", 422);
  const { data, error } = await getDb().rpc("record_checkin_progress", {
    p_session_id: sessionId,
    p_token_id: tokenId,
    p_scenario_id: scenario.id,
    p_step_id: input.stepId,
  });
  if (error) databaseError(error);
  return data;
}
