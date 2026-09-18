import type { CheckinSession } from "../model";

export type CheckinSessionDto = CheckinSession;

export function mapCheckinSession(dto: CheckinSessionDto): CheckinSession {
  return { ...dto };
}
