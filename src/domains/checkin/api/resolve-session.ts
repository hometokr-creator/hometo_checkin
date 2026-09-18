import type { ResolveCheckinSessionResult } from "../model/checkin";
import { checkinRequest, CheckinApiError } from "./http";
export async function resolveCheckinSession(
  token: string,
): Promise<ResolveCheckinSessionResult> {
  try {
    const { sessionId } = await checkinRequest<{ sessionId: string }>(
      "/api/checkin/access",
      { token },
    );
    return await checkinRequest<ResolveCheckinSessionResult>(
      "/api/checkin/session?sessionId=" + encodeURIComponent(sessionId),
    );
  } catch (error) {
    if (error instanceof CheckinApiError && error.code === "expired")
      return { status: "expired" };
    if (
      error instanceof CheckinApiError &&
      ["invalid", "unsupported"].includes(error.code)
    )
      return { status: "invalid" };
    return { status: "error" };
  }
}
