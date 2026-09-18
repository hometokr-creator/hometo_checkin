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
      expect(run.state.currentStepId).toBe("q_more");
      run.option("no");
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
    run.option("no");
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

describe("per-issue free text", () => {
  it("collects text before the loop and preserves both issue descriptions", () => {
    const run = machine();
    run.option("issue");
    run.tag("facility");
    run.detail("leak");
    expect(run.state.currentStepId).toBe("q_free");
    run.text("첫 번째: 천장 누수");
    expect(run.state.currentStepId).toBe("q_more");
    run.option("yes");
    const beforeDuplicate = run.state;
    run.tag("facility");
    expect(run.state).toBe(beforeDuplicate);
    run.tag("settlement");
    run.detail("free");
    expect(run.state.currentStepId).toBe("q_free2");
    run.text("두 번째: 관리비 문의");
    expect(run.state.status).toBe("submitting");
    expect(run.state.answers.freeText).toBeUndefined();
    expect(run.state.answers.issues.map((issue) => issue.freeText)).toEqual([
      "첫 번째: 천장 누수", "두 번째: 관리비 문의",
    ]);
    expect(isCheckinSubmission({ schemaVersion: 1, sessionId: "test", idempotencyKey: "two", answers: run.state.answers })).toBe(true);
  });

  it.each(["facility", "relationship", "settlement"] as const)("%s none and free both lead to text before the loop", (tag) => {
    for (const detail of ["none", "free"]) {
      const run = machine();
      run.option("issue");
      run.tag(tag);
      run.detail(detail);
      expect(run.state.currentStepId).toBe("q_free");
      run.text("");
      expect(run.state.currentStepId).toBe("q_more");
      run.option("no");
      expect(run.state.pendingOutcome).toBe("reported");
      expect(run.state.answers.issues[0].detail).toBe(detail);
    }
  });

  it.each(["gas-electricity", "unlocked-door", "personal-safety", "immediate-help", "none", "free"])("urgent %s collects text and never loops", (detail) => {
    const run = machine();
    run.option("ok");
    run.tag("urgent");
    expect(run.state.answers.overallTriage).toBe("R1");
    expect(run.state.status).toBe("active");
    run.detail(detail);
    expect(run.state.currentStepId).toBe("q_free_urgent");
    run.text(detail === "none" ? "" : "현관에 도움이 필요해요");
    expect(run.state.pendingOutcome).toBe("urgent");
    expect(run.state.transcript.some((message) => message.text.includes("혹시 다른 불편"))).toBe(false);
  });

  it("keeps the first description when the second issue is urgent", () => {
    const run = machine();
    run.option("issue");
    run.tag("facility");
    run.detail("leak");
    run.text("첫 번째 설명");
    run.option("yes");
    run.tag("urgent");
    run.detail("free");
    run.text("긴급 설명");
    expect(run.state.pendingOutcome).toBe("urgent");
    expect(run.state.answers.issues.map((issue) => issue.freeText)).toEqual(["첫 번째 설명", "긴급 설명"]);
  });

  it("does not mistake another issue's description for an empty other report", () => {
    const run = machine();
    run.option("ok");
    run.tag("other");
    run.text("");
    run.option("yes");
    run.tag("urgent");
    run.detail("none");
    run.text("긴급한 상황");
    expect(run.state.answers.issues.map((issue) => issue.tag)).toEqual(["urgent"]);
  });

  it("offers free text for positive event responses and classifies written concerns", () => {
    for (const text of ["", "다른 문의가 있어요"]) {
      const run = machine(ruleEventScenario);
      run.option("understood");
      expect(run.state.currentStepId).toBe("q_free_ok");
      run.text(text);
      expect(run.state.pendingOutcome).toBe(text ? "reported" : "ok");
    }
  });
});
