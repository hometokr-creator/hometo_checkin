export const CHECKIN_INTEREST_TOPICS = [
  { value: "kitchen", label: "주방·요리" },
  { value: "daily-life", label: "소음·생활습관" },
  { value: "cleaning", label: "청소·위생" },
  { value: "host", label: "집주인과 지내기" },
  { value: "costs", label: "비용·정산" },
  { value: "other", label: "그 외" },
] as const;

export type CheckinInterestTopic = (typeof CHECKIN_INTEREST_TOPICS)[number]["value"];

// Independent of CheckinSubmission: never attach these events to survey answers.
export type CheckinInterestEvent = { sessionId: string } & (
  | { type: "exposed" }
  | { type: "clicked" }
  | { type: "topics-submitted"; topics: readonly CheckinInterestTopic[] }
);

export interface CheckinInterestRecord {
  sessionId: string;
  clicked: boolean;
  topics: CheckinInterestTopic[];
  createdAt: string;
  exposedAt?: string;
  clickedAt?: string;
  topicsSubmittedAt?: string;
}
