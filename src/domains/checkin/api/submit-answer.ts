import type { CheckinSubmission } from "../model/checkin";
import { checkinRequest } from "./http";
export interface SubmitAnswerResult {
  status: "accepted" | "duplicate";
  outcome: "ok" | "reported" | "urgent";
  completionMessage: string;
}
export function submitCheckinAnswer(
  submission: CheckinSubmission,
): Promise<SubmitAnswerResult> {
  return checkinRequest(
    "/api/checkin/sessions/" +
      encodeURIComponent(submission.sessionId) +
      "/answer",
    submission,
  );
}
