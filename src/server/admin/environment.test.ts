import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { adminEnvironment } from "../env";
afterEach(() => vi.unstubAllEnvs());
function setup() {
  vi.stubEnv("SUPABASE_URL", "https://db.example.com");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  vi.stubEnv("CHECKIN_APP_ORIGIN", "https://checkin.example.com");
  vi.stubEnv("CHECKIN_ADMIN_EMAILS", " Admin@example.com ,");
}
describe("admin environment", () => {
  it("normalizes configured addresses without requiring a privileged key", () => {
    setup(); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(adminEnvironment().emails).toEqual(["admin@example.com"]);
    expect(adminEnvironment().secure).toBe(true);
  });
  it("rejects empty or invalid allowlists", () => {
    setup();
    for (const email of ["", ",,", "invalid"]) {
      vi.stubEnv("CHECKIN_ADMIN_EMAILS", email);
      expect(() => adminEnvironment()).toThrow();
    }
  });
  it("rejects insecure remote origins", () => {
    setup(); vi.stubEnv("CHECKIN_APP_ORIGIN", "http://remote.example.com");
    expect(() => adminEnvironment()).toThrow();
  });
});
