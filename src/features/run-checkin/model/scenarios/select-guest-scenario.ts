import type { CheckinSession } from "@/domains/checkin";

import type { Scenario } from "../scenario";
import { chatPreviewScenario } from "./chat-preview";
import { facilityEventScenario } from "./event-facility";
import { ruleEventScenario } from "./event-rule";
import { monthlyFirstScenario } from "./monthly-first";
import { monthlyGuestScenario } from "./monthly-guest";
import { onboardingD7Scenario } from "./onboarding-d7";
import { renewalGuestScenario } from "./renewal-guest";

export function selectGuestScenario(session: CheckinSession): Scenario {
  if (session.personaType !== "guest") return chatPreviewScenario;

  switch (session.roundType) {
    case "onboarding-d7":
      return onboardingD7Scenario;
    case "monthly":
      return monthlyGuestScenario;
    case "monthly-first":
      return monthlyFirstScenario;
    case "monthly-renewal":
      return renewalGuestScenario;
    case "event":
      if (session.eventContext?.type === "facility") return facilityEventScenario;
      if (session.eventContext?.type === "rule") return ruleEventScenario;
      return chatPreviewScenario;
  }
}
