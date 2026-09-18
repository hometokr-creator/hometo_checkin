import { afterEach, describe, expect, it, vi } from "vitest";
import { recordCheckinInterest } from "./record-checkin-interest";
import { submitCheckinAnswer } from "./submit-answer";
afterEach(() => vi.unstubAllGlobals());
describe("independent API boundaries", () => {
  it("sends survey data only to the answer endpoint", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          status: "accepted",
          outcome: "ok",
          completionMessage: "감사해요",
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const payload = {
      schemaVersion: 1 as const,
      sessionId: "session",
      idempotencyKey: "key",
      answers: { responses: {}, issues: [] },
    };
    await expect(submitCheckinAnswer(payload)).resolves.toMatchObject({
      status: "accepted",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/checkin/sessions/session/answer",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify(payload),
      }),
    );
  });
  it("propagates conflicts instead of claiming a successful submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ code: "conflict" }, { status: 409 }),
        ),
    );
    await expect(
      submitCheckinAnswer({
        schemaVersion: 1,
        sessionId: "session",
        idempotencyKey: "key",
        answers: { responses: {}, issues: [] },
      }),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
  });
  it("sends interest separately, including an explicit empty topic submission", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          sessionId: "session",
          clicked: true,
          topics: [],
          createdAt: "now",
          topicsSubmittedAt: "now",
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    await recordCheckinInterest({
      sessionId: "session",
      type: "topics-submitted",
      topics: [],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/checkin/sessions/session/interest-events",
      expect.objectContaining({
        body: JSON.stringify({ type: "topics-submitted", topics: [] }),
      }),
    );
  });
});
