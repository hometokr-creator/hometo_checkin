export type PersonaType = "guest" | "host";

export type RoundType =
  | "onboarding-d7"
  | "monthly"
  | "monthly-first"
  | "monthly-renewal"
  | "event";

export type EventContext =
  | { type: "facility"; itemName: string }
  | { type: "rule" };

export interface CheckinSession {
  id: string;
  personaType: PersonaType;
  roundType: RoundType;
  displayName?: string;
  eventContext?: EventContext;
}

export type CheckinIssueTag =
  | "facility"
  | "relationship"
  | "settlement"
  | "urgent"
  | "other";

export type TriageLevel = "R1" | "R2";

export interface CheckinIssue {
  tag: CheckinIssueTag;
  detail?: string;
  freeText?: string;
  triageLevel: TriageLevel;
}

export interface CheckinAnswers {
  responses: Record<string, string | number>;
  issues: CheckinIssue[];
  freeText?: string;
  overallTriage?: TriageLevel;
}

export type ResolveCheckinSessionResult =
  | { status: "active"; session: CheckinSession }
  | { status: "completed"; sessionId: string }
  | { status: "expired" }
  | { status: "invalid" }
  | { status: "error" };

export interface CheckinSubmission {
  schemaVersion: 1;
  sessionId: string;
  idempotencyKey: string;
  answers: CheckinAnswers;
}
