import { describe, expect, it, vi } from "vitest";

import { recordCheckinInterest } from "./record-checkin-interest";
import { submitCheckinAnswer } from "./submit-answer";
import type { CheckinInterestEvent } from "../model/checkin-interest";

vi.spyOn(console, "info").mockImplementation(() => {});

describe("community interest mock boundary", () => {
  it("records exposure without claiming a click or topic submission", async () => {
    const record = await recordCheckinInterest({ sessionId: "interest-exposed", type: "exposed" });
    expect(record.clicked).toBe(false);
    expect(record.exposedAt).toBeDefined();
    expect(record.topics).toEqual([]);
    expect(record.topicsSubmittedAt).toBeUndefined();
  });

  it("records click and multiple topics once, without downgrading on re-exposure", async () => {
    const sessionId = "interest-topics";
    await recordCheckinInterest({ sessionId, type: "exposed" });
    await recordCheckinInterest({ sessionId, type: "clicked" });
    const result = await recordCheckinInterest({ sessionId, type: "topics-submitted", topics: ["kitchen", "host"] });
    expect(result.clicked).toBe(true);
    expect(result.topics).toEqual(["kitchen", "host"]);
    expect(result.topicsSubmittedAt).toBeDefined();
    expect(await recordCheckinInterest({ sessionId, type: "topics-submitted", topics: ["costs"] })).toEqual(result);
    expect(await recordCheckinInterest({ sessionId, type: "exposed" })).toEqual(result);
    result.topics.push("other");
    expect((await recordCheckinInterest({ sessionId, type: "exposed" })).topics).toEqual(["kitchen", "host"]);
  });

  it("distinguishes empty topic submission from abandoning topic selection", async () => {
    const sessionId = "interest-empty";
    const clicked = await recordCheckinInterest({ sessionId, type: "clicked" });
    expect(clicked.topicsSubmittedAt).toBeUndefined();
    const done = await recordCheckinInterest({ sessionId, type: "topics-submitted", topics: [] });
    expect(done.topics).toEqual([]);
    expect(done.topicsSubmittedAt).toBeDefined();
  });

  it("does not consume survey submission keys", async () => {
    const sessionId = "separate-submission";
    await recordCheckinInterest({ sessionId, type: "clicked" });
    await expect(submitCheckinAnswer({ schemaVersion: 1, sessionId, idempotencyKey: `${sessionId}:monthly-guest:v1`, answers: { responses: {}, issues: [] } })).resolves.toEqual({ status: "accepted" });
  });

  it("rejects invalid topics and topic submission before a click", async () => {
    await expect(recordCheckinInterest({ sessionId: "not-clicked", type: "topics-submitted", topics: [] })).rejects.toThrow();
    await recordCheckinInterest({ sessionId: "invalid-topics", type: "clicked" });
    for (const topics of [["unknown"], ["host", "host"], "host"]) {
      await expect(recordCheckinInterest({ sessionId: "invalid-topics", type: "topics-submitted", topics } as unknown as CheckinInterestEvent)).rejects.toThrow();
    }
  });
});
