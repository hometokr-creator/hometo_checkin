import { describe, expect, it } from "vitest";

import type { CheckinSession } from "@/domains/checkin";

import { selectGuestScenario } from "./select-guest-scenario";

describe("selectGuestScenario", () => {
  it.each<[CheckinSession, string]>([
    [
      { id: "onboarding", personaType: "guest", roundType: "onboarding-d7" },
      "onboarding-d7-guest",
    ],
    [
      { id: "monthly", personaType: "guest", roundType: "monthly" },
      "monthly-guest",
    ],
    [
      { id: "first", personaType: "guest", roundType: "monthly-first" },
      "monthly-first-guest",
    ],
    [
      { id: "renewal", personaType: "guest", roundType: "monthly-renewal" },
      "monthly-renewal-guest",
    ],
    [
      {
        id: "facility-event",
        personaType: "guest",
        roundType: "event",
        eventContext: { type: "facility", itemName: "에어컨" },
      },
      "facility-event-guest",
    ],
    [
      {
        id: "rule-event",
        personaType: "guest",
        roundType: "event",
        eventContext: { type: "rule" },
      },
      "rule-event-guest",
    ],
  ])("selects the expected scenario for %s", (session, expectedId) => {
    expect(selectGuestScenario(session).id).toBe(expectedId);
  });

  it("falls back to the preview for unsupported sessions", () => {
    expect(
      selectGuestScenario({
        id: "host",
        personaType: "host",
        roundType: "monthly",
      }).id,
    ).toBe("chat-preview-guest");

    expect(
      selectGuestScenario({
        id: "event-without-context",
        personaType: "guest",
        roundType: "event",
      }).id,
    ).toBe("chat-preview-guest");
  });
});
