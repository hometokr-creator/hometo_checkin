import { checkinRequest } from "./http";
export function recordCheckinProgress(
  sessionId: string,
  scenarioId: string,
  stepId: string,
) {
  return checkinRequest<{ status: "recorded" }>(
    "/api/checkin/sessions/" +
      encodeURIComponent(sessionId) +
      "/progress-events",
    { scenarioId, stepId },
  );
}
