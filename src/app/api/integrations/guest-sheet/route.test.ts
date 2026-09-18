import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { persist, target } = vi.hoisted(() => ({ persist: vi.fn(), target: vi.fn() }));
vi.mock("@/server/checkin/guest-sync", () => ({ persistGuestSnapshot: persist }));
vi.mock("@/server/checkin/guest-sheet", () => ({ assertLiveGuestSyncTarget: target }));
import { POST } from "./route";
import { GUEST_SHEET, GuestSyncError } from "@/server/checkin/guest-sync-plan";
const secret = "test-secret-with-at-least-thirty-two-bytes";
const payload = () => ({
  runId: "00000000-0000-4000-8000-000000000001", dryRun: false,
  snapshot: { ...GUEST_SHEET, readAt: new Date().toISOString(), values: [
    ["게스트ID*", "이름*", "연락처", "고객상태*", "성별", "학교또는직장명", "실제 계약 시작일", "실제 계약 종료일"],
    ["G001", "테스트", "01012345678", "", "", "", "2026-09-01", "2027-03-01"],
    ["G002", "미완성", "01011112222", "", "", "", "", ""]
  ] }
});
const request = (body: unknown = payload(), token = secret) => new Request("https://example.invalid/api/integrations/guest-sheet", {
  method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
  body: JSON.stringify(body)
});
beforeEach(() => {
  vi.stubEnv("CHECKIN_GUEST_SYNC_SECRET", secret);
  vi.stubEnv("CHECKIN_GUEST_SYNC_ENABLED", "true");
  persist.mockReset(); target.mockReset();
  persist.mockResolvedValue({ summary: { inserted: 1 } });
});
afterEach(() => vi.unstubAllEnvs());
describe("Apps Script receiver", () => {
  it("rejects unauthenticated requests before accessing the DB", async () => {
    expect((await POST(request(payload(), "wrong"))).status).toBe(401);
    expect(target).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled();
  });
  it("requires explicit activation", async () => {
    vi.stubEnv("CHECKIN_GUEST_SYNC_ENABLED", "false");
    expect((await POST(request())).status).toBe(503);
    expect(persist).not.toHaveBeenCalled();
  });
  it("blocks a test database", async () => {
    target.mockImplementation(() => { throw new GuestSyncError("LIVE_SOURCE_REQUIRES_PRODUCTION_DATABASE"); });
    expect((await POST(request())).status).toBe(503);
    expect(persist).not.toHaveBeenCalled();
  });
  it("previews complete and incomplete rows without saving", async () => {
    const body = payload(); body.dryRun = true;
    const response = await POST(request(body));
    expect(await response.json()).toEqual({ dryRun: true, summary: { complete: 1, incomplete: 1, skippedRows: 0 }, complete: 1, incomplete: 1, skippedRows: 0 });
    expect(persist).not.toHaveBeenCalled();
  });
  it("passes the original run ID for database idempotency", async () => {
    const body = payload();
    expect((await POST(request(body))).status).toBe(200);
    expect(persist).toHaveBeenCalledWith(body.snapshot, body.runId);
  });
  it("rejects wrong tabs and empty snapshots", async () => {
    for (const snapshot of [{ ...payload().snapshot, sheetId: 0 }, { ...payload().snapshot, values: [] }]) {
      expect((await POST(request({ ...payload(), snapshot }))).status).toBe(503);
    }
    expect(persist).not.toHaveBeenCalled();
  });
  it("rejects old and malformed payloads", async () => {
    const body = payload(); body.snapshot.readAt = "2020-01-01";
    expect((await POST(request(body))).status).toBe(400);
    expect((await POST(request(null))).status).toBe(400);
    expect((await POST(request({ ...payload(), runId: "bad" }))).status).toBe(400);
    expect(persist).not.toHaveBeenCalled();
  });
  it("limits streamed payload size even without content-length", async () => {
    expect((await POST(request("x".repeat(2_000_001)))).status).toBe(413);
    expect(persist).not.toHaveBeenCalled();
  });
  it("does not return raw provider errors", async () => {
    persist.mockRejectedValue(new Error("private customer data"));
    expect(await (await POST(request())).json()).toEqual({ error: "GUEST_SYNC_FAILED" });
  });
});
