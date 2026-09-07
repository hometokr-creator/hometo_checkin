import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { accessEnvironment } from "./env";
describe("server configuration", () => {
  it("keeps the committed template free of credentials", () => {
    const env = parseEnv(readFileSync(".env.example", "utf8"));
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("");
    expect(env.CHECKIN_ACCESS_SECRET).toBe("");
  });
  it("allows loopback production tests while rejecting remote HTTP origins", () => {
    vi.stubEnv("CHECKIN_ACCESS_SECRET", "a".repeat(48));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHECKIN_APP_ORIGIN", "http://127.0.0.1:3100");
    expect(accessEnvironment().secure).toBe(false);
    vi.stubEnv("CHECKIN_APP_ORIGIN", "http://example.com");
    expect(() => accessEnvironment()).toThrow();
    vi.unstubAllEnvs();
  });
});
