import type { ResolveCheckinSessionResult } from "../model";
import { MOCK_SESSIONS } from "./mock-sessions";

type NonActiveStatus = Exclude<ResolveCheckinSessionResult["status"], "active">;

const MOCK_STATE_TOKENS: Record<string, NonActiveStatus> = {
  "demo-completed": "completed",
  "demo-expired": "expired",
  "demo-invalid": "invalid",
  "demo-error": "error",
};

export async function resolveCheckinSession(
  token: string,
): Promise<ResolveCheckinSessionResult> {
  const session = MOCK_SESSIONS[token as keyof typeof MOCK_SESSIONS];
  if (session) return { status: "active", session };

  const status = MOCK_STATE_TOKENS[token];
  if (status === "completed") return { status, sessionId: "session-completed" };
  if (status === "expired") return { status };
  if (status === "error") return { status };
  return { status: "invalid" };
}
