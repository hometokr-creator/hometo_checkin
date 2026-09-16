import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { sync } = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock("@/server/checkin/guest-sync", () => ({ syncGuestSheet: sync }));
import { GET } from "./route";
const secret = "test-secret-which-is-longer-than-32-bytes";
const request = (value = `Bearer ${secret}`) => new Request("https://example.invalid/api/cron/sync-guests", { headers: { authorization: value } });
beforeEach(() => { sync.mockReset(); vi.stubEnv("CRON_SECRET", secret); vi.stubEnv("CHECKIN_GUEST_SYNC_ENABLED", "true"); });
afterEach(() => vi.unstubAllEnvs());
describe("daily guest cron boundary", () => {
  it("never reads Google or writes the DB for an unauthorized request", async () => {
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer undefined"))).status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });
  it("requires an explicit enable flag", async () => {
    vi.stubEnv("CHECKIN_GUEST_SYNC_ENABLED", "false");
    expect((await GET(request())).status).toBe(503);
    expect(sync).not.toHaveBeenCalled();
  });
  it("returns only the synchronization summary on success", async () => {
    sync.mockResolvedValue({ runId: "fake-run", summary: { inserted: 5, excluded_incomplete: 17 } });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runId: "fake-run", summary: { inserted: 5, excluded_incomplete: 17 } });
  });
  it("returns a safe failure without logging the original provider object", async () => {
    sync.mockRejectedValue(new Error("secret-customer-data"));
    expect(await (await GET(request())).json()).toEqual({ error: "GUEST_SYNC_FAILED" });
  });
});
