import { describe, expect, it } from "vitest";

import { CHECKIN_TAG_OPTIONS, getCheckinDetailOptions, isCheckinSubmission } from "@/domains/checkin";
import type { CheckinIssueTag } from "@/domains/checkin";
import type { Scenario } from "./scenario";
import { createInitialState, createMachineReducer } from "./use-checkin-machine";
import { monthlyGuestScenario } from "./scenarios/monthly-guest";
import { monthlyFirstScenario } from "./scenarios/monthly-first";
import { onboardingD7Scenario } from "./scenarios/onboarding-d7";
import { renewalGuestScenario } from "./scenarios/renewal-guest";
import { ruleEventScenario } from "./scenarios/event-rule";

function machine(scenario: Scenario = monthlyGuestScenario) {
  const context = { name: "입주자", eventItemName: "에어컨" };
  const reduce = createMachineReducer(scenario, context);
  let state = createInitialState(scenario, context);
  return {
    get state() { return state; },
    option(value: string) {
      const control = scenario.steps[state.currentStepId!].control;
      if (control.kind !== "options") throw new Error("Expected options");
      const option = control.options.find((item) => item.value === value)!;
      state = reduce(state, { type: "answer-option", option });
    },
    tag(value: CheckinIssueTag) {
      state = reduce(state, { type: "select-tag", tag: CHECKIN_TAG_OPTIONS.find((item) => item.value === value)! });
    },
    detail(value: string) {
      const issue = state.answers.issues.at(-1)!;
      const detail = getCheckinDetailOptions(issue.tag).find((item) => item.value === value)!;
      state = reduce(state, { type: "select-detail", detail });
    },
    text(text: string) { state = reduce(state, { type: "submit-text", text }); },
    succeed() { state = reduce(state, { type: "submit-succeeded" }); },
  };
}

describe("guest answer flow", () => {
  it.each([monthlyGuestScenario, monthlyFirstScenario, onboardingD7Scenario, renewalGuestScenario])(
    "$id routes positive answers to the soft tag prompt",
    (scenario) => {
      const run = machine(scenario);
      if (scenario.id === "monthly-renewal-guest") {
        run.option("renew");
        run.option("none");
      } else run.option("ok");
      expect(run.state.currentStepId).toBe("q_tag_soft");
      run.tag("other");
      run.text("  ");
      expect(run.state.pendingOutcome).toBe("ok");
      expect(run.state.answers.issues).toEqual([]);
      expect(run.state.answers.overallTriage).toBeUndefined();
      expect(isCheckinSubmission({ schemaVersion: 1, sessionId: "test", idempotencyKey: "test", answers: run.state.answers })).toBe(true);
    },
  );

  it("retains a written other issue as a report", () => {
    const run = machine();
    run.option("ok");
    run.tag("other");
    run.text("  생활에 불편함이 있어요  ");
    expect(run.state.pendingOutcome).toBe("reported");
    expect(run.state.answers.issues).toHaveLength(1);
    expect(run.state.answers.overallTriage).toBe("R2");
  });

  it("preserves explicit event requests even when free text is skipped", () => {
    const run = machine(ruleEventScenario);
    run.option("needs-help");
    run.text("");
    expect(run.state.pendingOutcome).toBe("reported");
    expect(run.state.answers.issues).toEqual([{ tag: "other", triageLevel: "R2" }]);
  });
});
