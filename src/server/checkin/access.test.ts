import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { signGrant, verifyGrant, digestToken } from "./access";
import { sessionDto } from "./scenario-registry";
import { body } from "./http";
const grant = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  exp: Date.now() + 60000,
};
beforeEach(() => {
  vi.stubEnv("CHECKIN_ACCESS_SECRET", "a".repeat(48));
  vi.stubEnv("CHECKIN_APP_ORIGIN", "http://localhost:3000");
});
describe("scoped check-in access", () => {
  it("verifies signed grants and rejects tampering", () => {
    const signed = signGrant(grant);
    expect(verifyGrant(signed)).toEqual(grant);
    expect(() => verifyGrant(signed + "x")).toThrow("invalid");
    expect(() => verifyGrant("unsigned")).toThrow("invalid");
  });
  it("expires without extending the original grant", () => {
    expect(() =>
      verifyGrant(signGrant({ ...grant, exp: Date.now() - 1 })),
    ).toThrow("expired");
  });
  it("stores a digest instead of an access token", () => {
    const digest = digestToken("a".repeat(43));
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain("a".repeat(43));
  });
  it("rejects cross-origin and oversized requests", async () => {
    await expect(
      body(
        new Request("http://localhost:3000/api/checkin/access", {
          method: "POST",
          headers: {
            origin: "https://attacker.invalid",
            "content-type": "application/json",
          },
          body: "{}",
        }),
      ),
    ).rejects.toThrow("invalid");
    await expect(
      body(
        new Request("http://localhost:3000/api/checkin/access", {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
          },
          body: JSON.stringify({ token: "a".repeat(5000) }),
        }),
        2048,
      ),
    ).rejects.toThrow("invalid-answer");
  });
  it("rejects unsupported versions instead of falling back to a preview", () => {
    const row = {
      id: grant.sessionId,
      participant_id: grant.tokenId,
      persona_type: "guest",
      round_type: "monthly",
      round_key: "test",
      scenario_id: "monthly-guest",
      scenario_version: 1,
      triage_rule_version: 1,
      event_type: null,
      event_context_snapshot: null,
      status: "open",
      answer_expires_at: new Date().toISOString(),
    };
    expect(sessionDto(row).scenarioId).toBe("monthly-guest");
    expect(() => sessionDto({ ...row, scenario_version: 2 })).toThrow(
      "unsupported",
    );
    expect(() =>
      sessionDto({ ...row, scenario_id: "rule-event-guest" }),
    ).toThrow("unsupported");
    expect(() => sessionDto({ ...row, persona_type: "host" })).toThrow(
      "unsupported",
    );
  });
});
