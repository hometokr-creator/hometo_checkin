import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), send: vi.fn(), ready: vi.fn(), delivery: vi.fn() }));
vi.mock("../db", () => ({ getDb: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("./nhn-readiness", () => ({ nhnTemplateReady: mocks.ready, nhnDeliveryResult: mocks.delivery }));
vi.mock("./nhn-alimtalk", () => ({ sendNhnScheduledAlimtalk: mocks.send }));
import { runCheckinDispatch } from "./dispatch";
import { GET } from "../../app/api/internal/checkin-dispatch/route";
const env = { CHECKIN_DISPATCH_MODE: "test", NHN_ALIMTALK_TEST_SEND_ENABLED: "true",
 NHN_ALIMTALK_TEST_RECIPIENTS: "01000000000", NHN_ALIMTALK_APPROVED_TEMPLATE_CODES: "hometo_d7_v1" };
const candidate = { schedule_id: "s", round_type: "onboarding-d7", scheduled_on: "2026-09-19",
 guest_updated_at: "2026-09-19T04:00:00Z", phone: "01000000000", display_name: "가상 고객" };
beforeEach(() => {
 vi.resetAllMocks();
 vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-19T05:00:00Z").getTime());
 vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-19T05:00:00Z"));
 mocks.rpc.mockImplementation((name: string) => name === "checkin_dispatch_candidates"
 ? { limit: async () => ({ data: [candidate], error: null }) }
 : Promise.resolve({ data: name === "claim_checkin_dispatch" ? { attemptId: "a", phone: candidate.phone, name: candidate.display_name } : null, error: null }));
 mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) });
 mocks.ready.mockResolvedValue(true); mocks.send.mockResolvedValue({ state: "accepted", requestId: "r", recipientSeq: 1 });
});
import { afterEach } from "vitest";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("durable dispatch", () => {
 it("does no work when disabled, and dry-run never claims or sends", async () => {
   await runCheckinDispatch({}); expect(mocks.rpc).not.toHaveBeenCalled();
   await runCheckinDispatch({ CHECKIN_DISPATCH_MODE: "dry-run" });
   expect(mocks.rpc.mock.calls.map(c => c[0])).toEqual(["checkin_dispatch_candidates"]);
   expect(mocks.send).not.toHaveBeenCalled();
 });
 it("records acceptance separately without activating the response deadline", async () => {
   expect((await runCheckinDispatch(env)).accepted).toBe(1);
   expect(mocks.rpc).toHaveBeenCalledWith("record_checkin_dispatch_request", {
     p_attempt_id: "a", p_outcome: "accepted", p_request_id: "r", p_recipient_seq: 1,
   });
   expect(mocks.rpc.mock.calls.some(c => c[0] === "record_checkin_dispatch_delivery")).toBe(false);
   const claim = mocks.rpc.mock.calls.find(c => c[0] === "claim_checkin_dispatch")![1];
   expect(claim.p_token_digest).toMatch(/^[a-f0-9]{64}$/);
   expect(JSON.stringify(claim)).not.toContain(mocks.send.mock.calls[0][0].templateParameter.token);
 });
 it("does not claim or send unapproved templates", async () => {
   mocks.ready.mockResolvedValue(false); await runCheckinDispatch(env);
   expect(mocks.rpc.mock.calls.some(c => c[0] === "claim_checkin_dispatch")).toBe(false);
   expect(mocks.send).not.toHaveBeenCalled();
 });
 it("records uncertainty without retry", async () => {
   mocks.send.mockRejectedValue(new Error("timeout")); await runCheckinDispatch(env);
   expect(mocks.send).toHaveBeenCalledTimes(1);
   expect(mocks.rpc).toHaveBeenCalledWith("record_checkin_dispatch_request", expect.objectContaining({ p_outcome: "unknown" }));
 });
 it("does not send when another worker has already claimed", async () => {
   mocks.rpc.mockImplementation((name: string) => name === "checkin_dispatch_candidates"
    ? { limit: async () => ({ data: [candidate], error: null }) } : Promise.resolve({ data: null, error: null }));
   await runCheckinDispatch(env); expect(mocks.send).not.toHaveBeenCalled();
 });
 it("rejects scheduler requests before any database or provider access", async () => {
   vi.stubEnv("CRON_SECRET", "x".repeat(32));
   expect((await GET(new Request("https://example.com/api/internal/checkin-dispatch"))).status).toBe(401);
   expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
 });
});
