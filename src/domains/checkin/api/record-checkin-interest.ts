import type {
  CheckinInterestEvent,
  CheckinInterestRecord,
} from "../model/checkin-interest";
import { checkinRequest } from "./http";
export function recordCheckinInterest(
  event: CheckinInterestEvent,
): Promise<CheckinInterestRecord> {
  const { sessionId, ...payload } = event;
  return checkinRequest(
    "/api/checkin/sessions/" +
      encodeURIComponent(sessionId) +
      "/interest-events",
    payload,
  );
}
