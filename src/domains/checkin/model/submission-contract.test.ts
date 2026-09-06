import { describe, expect, it } from "vitest";

import { submitCheckinAnswer } from "../api/submit-answer";
import type { CheckinSubmission } from "./checkin";
import { isCheckinSubmission } from "./submission-contract";

const validSubmission: CheckinSubmission = {
  schemaVersion: 1,
  sessionId: "session-monthly",
  idempotencyKey: "session-monthly:monthly-guest:v1:test",
  answers: {
    responses: { monthlyStatus: "issue" },
    issues: [{ tag: "facility", detail: "leak", triageLevel: "R2" }],
    freeText: "천장에서 물이 떨어져요.",
    overallTriage: "R2",
  },
};

describe("check-in submission contract", () => {
  it("accepts a valid payload", () => {
    expect(isCheckinSubmission(validSubmission)).toBe(true);
  });

  it("rejects invalid versions, oversized issue lists, and inconsistent triage", () => {
    expect(
      isCheckinSubmission({ ...validSubmission, schemaVersion: 2 }),
    ).toBe(false);
    expect(
      isCheckinSubmission({
        ...validSubmission,
        answers: {
          ...validSubmission.answers,
          issues: [
            { tag: "facility", triageLevel: "R2" },
            { tag: "settlement", triageLevel: "R2" },
            { tag: "other", triageLevel: "R2" },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isCheckinSubmission({
        ...validSubmission,
        answers: {
          ...validSubmission.answers,
          issues: [{ tag: "urgent", triageLevel: "R2" }],
          overallTriage: "R2",
        },
      }),
    ).toBe(false);
  });

  it("rejects free text longer than 500 characters", () => {
    expect(
      isCheckinSubmission({
        ...validSubmission,
        answers: { ...validSubmission.answers, freeText: "가".repeat(501) },
      }),
    ).toBe(false);
  });

  it("accepts a submission once and treats the same key as a duplicate", async () => {
    await expect(submitCheckinAnswer(validSubmission)).resolves.toEqual({
      status: "accepted",
    });
    await expect(submitCheckinAnswer(validSubmission)).resolves.toEqual({
      status: "duplicate",
    });
  });

  it("blocks invalid payloads at the submission boundary", async () => {
    const invalidSubmission = {
      ...validSubmission,
      schemaVersion: 2,
    } as unknown as CheckinSubmission;

    await expect(submitCheckinAnswer(invalidSubmission)).rejects.toThrow(
      "Invalid check-in submission payload",
    );
  });
});

it("validates each issue's free text independently", () => {
  const submission = {
    ...validSubmission,
    answers: {
      responses: {},
      issues: [
        { tag: "facility", freeText: "가".repeat(500), triageLevel: "R2" },
        { tag: "urgent", detail: "free", freeText: "나".repeat(500), triageLevel: "R1" },
      ],
      overallTriage: "R1",
    },
  };
  expect(isCheckinSubmission(submission)).toBe(true);
  for (const freeText of [123, "가".repeat(501)]) {
    expect(isCheckinSubmission({
      ...submission,
      answers: { ...submission.answers, issues: [{ tag: "urgent", triageLevel: "R1", freeText }] },
    })).toBe(false);
  }
});
