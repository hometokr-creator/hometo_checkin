import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { nhnDeliveryResult, parseNhnTime, nhnTemplateReady } from "./nhn-readiness";
import { dispatchDue, dispatchMode, inDispatchWindow } from "./dispatch-policy";
const env = { NHN_ALIMTALK_APP_KEY: "fake", NHN_ALIMTALK_SECRET_KEY: "fake",
  NHN_ALIMTALK_SENDER_KEY: "fake", CHECKIN_APP_ORIGIN: "https://example.com" };
const response = (message: unknown) => vi.fn<typeof fetch>().mockResolvedValue(Response.json({
  header: { isSuccessful: true }, message,
}));
describe("delivery-based expiration inputs", () => {
  it("accepts NHN fractional delivery timestamps", () => {
    expect(parseNhnTime("2026-09-21 14:25:42.0")).toBe("2026-09-21T05:25:42.000Z");
    expect(parseNhnTime("2026-09-21 14:25:42.123")).toBe("2026-09-21T05:25:42.123Z");
    expect(parseNhnTime("2026-02-30 14:25:42.0")).toBeNull();
  });
  it("converts actual NHN Korean delivery time without using polling time", async () => {
    const fetcher = response({ requestId: "r", recipientSeq: 1, messageStatus: "COMPLETED", receiveDate: "2026-09-19 14:03:00" });
    expect(await nhnDeliveryResult("r", 1, env, fetcher)).toEqual({ state: "sent", receivedAt: "2026-09-19T05:03:00.000Z" });
  });
  it.each([undefined, "", "2026-02-30 14:00:00", "2026-09-19T05:00:00Z"])("rejects missing or malformed time %s", value => {
    expect(parseNhnTime(value)).toBeNull();
  });
  it("does not treat accepted or missing delivery time as successful delivery", async () => {
    expect(await nhnDeliveryResult("r", 1, env, response({ requestId: "r", recipientSeq: 1, messageStatus: "READY" }))).toEqual({ state: "pending" });
    expect(await nhnDeliveryResult("r", 1, env, response({ requestId: "r", recipientSeq: 1, messageStatus: "COMPLETED" }))).toEqual({ state: "unknown" });
    expect(await nhnDeliveryResult("r", 1, env, response({ requestId: "other", recipientSeq: 1, messageStatus: "COMPLETED" }))).toEqual({ state: "unknown" });
  });
  it("requires actual approval and expected token button", async () => {
    const template = { templateCode: "code", senderKey: "fake", status: "TSC03", block: false, dormant: false,
      templateContent: "안녕하세요 #{name}", buttons: [{ type: "WL", linkMo: "https://example.com/c/#{token}", linkPc: "https://example.com/c/#{token}" }] };
    for (const [change, expected] of [[{}, true], [{ status: "TSC02" }, false], [{ block: true }, false], [{ buttons: [] }, false]] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ header: { isSuccessful: true }, template: { ...template, ...change } }));
      expect(await nhnTemplateReady("code", env, fetcher)).toBe(expected);
    }
  });
});
describe("Korean dispatch policy", () => {
  it.each([["04:59:59.999", false], ["05:00:00.000", true], ["09:00:00.000", true], ["09:00:00.001", false]])("enforces boundary %s", (time, expected) => {
    expect(inDispatchWindow(new Date("2026-09-19T" + time + "Z"))).toBe(expected);
  });
  it("includes weekends but never catches up previous days", () => {
    expect(dispatchDue("2026-09-19", new Date("2026-09-19T05:00:00Z"))).toBe(true);
    expect(dispatchDue("2026-09-18", new Date("2026-09-19T05:00:00Z"))).toBe(false);
  });
  it("defaults disabled and rejects preview sending", () => {
    expect(dispatchMode({})).toBe("disabled");
    expect(() => dispatchMode({ CHECKIN_DISPATCH_MODE: "test", VERCEL_ENV: "preview" })).toThrow("PREVIEW_SEND_BLOCKED");
    expect(() => dispatchMode({ CHECKIN_DISPATCH_MODE: "live" })).toThrow("LIVE_SEND_BLOCKED");
  });
});
