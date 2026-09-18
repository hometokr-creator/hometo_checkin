import type { CheckinSession } from "../model";

export const MOCK_SESSIONS = {
  "demo-monthly": {
    id: "session-monthly",
    personaType: "guest",
    roundType: "monthly",
    displayName: "정인",
  },
  "demo-onboarding": {
    id: "session-onboarding",
    personaType: "guest",
    roundType: "onboarding-d7",
    displayName: "정인",
  },
  "demo-monthly-first": {
    id: "session-monthly-first",
    personaType: "guest",
    roundType: "monthly-first",
    displayName: "정인",
  },
  "demo-renewal": {
    id: "session-renewal",
    personaType: "guest",
    roundType: "monthly-renewal",
    displayName: "정인",
  },
  "demo-event-facility": {
    id: "session-event-facility",
    personaType: "guest",
    roundType: "event",
    displayName: "정인",
    eventContext: { type: "facility", itemName: "에어컨" },
  },
  "demo-event-rule": {
    id: "session-event-rule",
    personaType: "guest",
    roundType: "event",
    displayName: "정인",
    eventContext: { type: "rule" },
  },
} as const satisfies Record<string, CheckinSession>;
