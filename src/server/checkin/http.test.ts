import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { body } from "./http";
afterEach(() => vi.unstubAllEnvs());
describe("check-in domain transition", () => {
  it("accepts only explicitly configured origins, including legacy links", async () => {
    vi.stubEnv("CHECKIN_ACCESS_SECRET", "a".repeat(48));
    vi.stubEnv("CHECKIN_APP_ORIGIN", "https://checkin.hometogether.kr");
    vi.stubEnv("CHECKIN_LEGACY_APP_ORIGINS", "https://hometogether-checkin-web.vercel.app");
    for (const origin of ["https://checkin.hometogether.kr", "https://hometogether-checkin-web.vercel.app"]) {
      await expect(body(new Request(origin, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" }))).resolves.toEqual({});
    }
    for (const origin of ["https://evil.example", "https://checkin.hometogether.kr.evil.example", "null", ""]) {
      await expect(body(new Request("https://checkin.hometogether.kr", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" }))).rejects.toMatchObject({ status: 403 });
    }
  });
});
