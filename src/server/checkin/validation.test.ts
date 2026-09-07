import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { CheckinSubmission } from "@/domains/checkin/model/checkin";
import samples from "./fixtures/submissions.json";
import { validateSubmission } from "./validation";
import type { SessionRow } from "./scenario-registry";
const sid = "33333333-3333-4333-8333-333333333333";
function row(index = 0): SessionRow {
  return {
    id: sid,
    participant_id: sid,
    persona_type: "guest",
    round_type: index >= 3 ? "event" : "monthly",
    round_key: "test",
    scenario_id:
      index === 3
        ? "rule-event-guest"
        : index === 4
          ? "facility-event-guest"
          : "monthly-guest",
    scenario_version: 1,
    triage_rule_version: 1,
    event_type: index === 3 ? "rule" : index === 4 ? "facility" : null,
    event_context_snapshot:
      index === 3
        ? { type: "rule" }
        : index === 4
          ? { type: "facility", itemName: "에어컨" }
          : null,
    status: "open",
    answer_expires_at: new Date(Date.now() + 86400000).toISOString(),
  };
}
function sample(i = 0): CheckinSubmission {
  return {
    ...structuredClone(samples[i]),
    sessionId: sid,
  } as unknown as CheckinSubmission;
}
describe("authoritative submission validation", () => {
  it.each([0, 1, 2, 3, 4])(
    "accepts documented payload %s without losing content",
    (index) => {
      const input = sample(index);
      const result = validateSubmission(input, row(index));
      expect(result.answers).toEqual(input.answers);
      expect(result.outcome).toBe(
        ["reported", "ok", "urgent", "reported", "reported"][index],
      );
    },
  );
  it("separates positive event feedback copy from reported outcome", () => {
    const result = validateSubmission(sample(4), row(4));
    expect(result.outcome).toBe("reported");
    expect(result.completionMessage).toBe(
      "의견 남겨주셔서 감사해요! 잘 전달할게요 🙂",
    );
  });
  it("recalculates tampered triage without changing the semantic request hash", () => {
    const input = sample(2);
    const original = validateSubmission(input, row());
    input.answers.overallTriage = "R2";
    input.answers.issues[0].triageLevel = "R2";
    const result = validateSubmission(input, row());
    expect(result.answers.overallTriage).toBe("R1");
    expect(result.requestHash).toBe(original.requestHash);
  });
  it("ignores key order and retry key, but detects changed text", () => {
    const input = sample();
    const original = validateSubmission(input, row());
    input.idempotencyKey = "another-key";
    input.answers.responses = Object.fromEntries(
      Object.entries(input.answers.responses).reverse(),
    ) as typeof input.answers.responses;
    expect(validateSubmission(input, row()).requestHash).toBe(
      original.requestHash,
    );
    input.answers.issues[0].freeText = "설명이 달라짐";
    expect(validateSubmission(input, row()).requestHash).not.toBe(
      original.requestHash,
    );
  });
  it("normalizes text edges and CRLF without collapsing internal whitespace", () => {
    const input = sample();
    input.answers.issues[0].freeText = "  첫 줄\r\n둘째  줄  ";
    expect(validateSubmission(input, row()).answers.issues[0].freeText).toBe(
      "첫 줄\n둘째  줄",
    );
  });
  it("rejects foreign session and schema", () => {
    expect(() =>
      validateSubmission({ ...sample(), sessionId: "other" }, row()),
    ).toThrow("invalid");
    expect(() =>
      validateSubmission({ ...sample(), schemaVersion: 2 }, row()),
    ).toThrow("invalid-answer");
  });
  it("rejects unknown fields and steps outside the chosen path", () => {
    expect(() =>
      validateSubmission({ ...sample(), extra: true }, row()),
    ).toThrow();
    const input = sample(1);
    Object.assign(input.answers.responses, { urgentDetail: "unlocked-door" });
    expect(() => validateSubmission(input, row())).toThrow();
  });
  it("rejects mismatched chips, duplicated tags, more than two issues and long text", () => {
    const chip = sample();
    chip.answers.issues[0].tag = "relationship";
    Object.assign(chip.answers.responses, { issueTag: "relationship" });
    expect(() => validateSubmission(chip, row())).toThrow();
    const duplicate = sample();
    duplicate.answers.issues[1].tag = "facility";
    expect(() => validateSubmission(duplicate, row())).toThrow();
    const excessive = sample();
    excessive.answers.issues.push({ ...excessive.answers.issues[0] });
    expect(() => validateSubmission(excessive, row())).toThrow();
    const long = sample();
    long.answers.issues[0].freeText = "가".repeat(501);
    expect(() => validateSubmission(long, row())).toThrow();
  });
  it("preserves the second real issue after an empty first other is removed", () => {
    const input = sample();
    Object.assign(input.answers.responses, {
      issueTag: "other",
      issueFreeText: "skipped",
    });
    delete input.answers.responses.issueDetail;
    input.answers.issues.shift();
    const result = validateSubmission(input, row());
    expect(result.answers.issues).toHaveLength(1);
    expect(result.answers.responses.issueTag).toBe("other");
  });
  it("requires urgent text step and disallows the more-issues loop afterwards", () => {
    const input = sample(2);
    delete input.answers.responses.urgentFreeText;
    expect(() => validateSubmission(input, row())).toThrow();
    Object.assign(input.answers.responses, {
      urgentFreeText: "skipped",
      hasAnotherIssue: "no",
    });
    expect(() => validateSubmission(input, row())).toThrow();
  });
  it("rejects contradictory provided/skipped markers and hidden free text", () => {
    const input = sample(1);
    input.answers.freeText = "hidden text";
    expect(() => validateSubmission(input, row())).toThrow();
    const other = sample();
    Object.assign(other.answers.responses, { issueFreeText: "skipped" });
    expect(() => validateSubmission(other, row())).toThrow();
  });
});

it("keeps the first explanation when the second issue is urgent", () => {
  const input = sample();
  input.answers.responses.secondIssueTag = "urgent";
  delete input.answers.responses.secondIssueDetail;
  delete input.answers.responses.secondIssueFreeText;
  input.answers.responses.urgentDetail = "unlocked-door";
  input.answers.responses.urgentFreeText = "provided";
  input.answers.issues[1] = {
    tag: "urgent",
    detail: "unlocked-door",
    freeText: "문이 잠기지 않아요",
    triageLevel: "R1",
  };
  input.answers.overallTriage = "R1";
  const result = validateSubmission(input, row());
  expect(result.outcome).toBe("urgent");
  expect(result.answers.issues[0].freeText).toBe(
    input.answers.issues[0].freeText,
  );
  expect(result.answers.issues).toHaveLength(2);
});

it.each([
  ["onboarding-d7", "onboarding-d7-guest", "onboardingStatus"],
  ["monthly-first", "monthly-first-guest", "firstMonthStatus"],
  ["monthly-renewal", "monthly-renewal-guest", "renewalSupportStatus"],
])(
  "validates the distinct response contract for %s",
  (roundType, scenarioId, answerKey) => {
    const input = sample(1);
    delete input.answers.responses.monthlyStatus;
    input.answers.responses[answerKey] =
      roundType === "monthly-renewal" ? "none" : "ok";
    if (roundType === "monthly-renewal")
      input.answers.responses.renewalIntent = "considering";
    const result = validateSubmission(input, {
      ...row(),
      round_type: roundType,
      scenario_id: scenarioId,
    });
    expect(result.outcome).toBe("ok");
    expect(result.answers.responses[answerKey]).toBe(
      input.answers.responses[answerKey],
    );
  },
);
