import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock("./access", () => ({ authorize: mocks.authorize }));
vi.mock("../db", () => ({ getDb: () => ({ rpc: mocks.rpc }) }));
import { validateInterest, recordProgress } from "./record-events";
describe("independent events", () => {
  it("allows empty topics but rejects unknown, duplicate and excessive topics", () => {
    expect(validateInterest({ type: "topics-submitted", topics: [] })).toEqual({
      type: "topics-submitted",
      topics: [],
    });
    for (const topics of [
      ["bad"],
      ["host", "host"],
      "host",
      Array(7).fill("host"),
    ])
      expect(() =>
        validateInterest({ type: "topics-submitted", topics }),
      ).toThrow();
  });
  it("rejects answer content and client experiment assignment", () => {
    for (const extra of [
      { answers: {} },
      { freeText: "private" },
      { variantKey: "invented" },
      { interestHookPercent: 75 },
    ])
      expect(() => validateInterest({ type: "exposed", ...extra })).toThrow();
  });
  it("accepts only steps from the pinned scenario and never records answers", async () => {
    mocks.authorize.mockResolvedValue({
      tokenId: "token",
      row: {
        id: "id",
        persona_type: "guest",
        round_type: "monthly",
        scenario_id: "monthly-guest",
        scenario_version: 1,
        triage_rule_version: 1,
        event_type: null,
        event_context_snapshot: null,
      },
    });
    mocks.rpc.mockResolvedValue({ data: { status: "recorded" }, error: null });
    await expect(
      recordProgress("id", { scenarioId: "monthly-guest", stepId: "q_main" }),
    ).resolves.toEqual({ status: "recorded" });
    expect(mocks.rpc).toHaveBeenCalledWith("record_checkin_progress", {
      p_session_id: "id",
      p_token_id: "token",
      p_scenario_id: "monthly-guest",
      p_step_id: "q_main",
    });
    for (const input of [
      { scenarioId: "monthly-guest", stepId: "q_missing" },
      { scenarioId: "rule-event-guest", stepId: "q_main" },
      { scenarioId: "monthly-guest", stepId: "q_main", freeText: "private" },
    ])
      await expect(recordProgress("id", input)).rejects.toThrow();
  });
});
