import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("google-auth-library", () => ({ JWT: class { request = request; } }));
import { readGuestSheet } from "./guest-sheet";
import { GUEST_PRODUCTION_PROJECT, GUEST_SHEET } from "./guest-sync-plan";

beforeEach(() => {
  request.mockReset();
  vi.stubEnv("SUPABASE_URL", `https://${GUEST_PRODUCTION_PROJECT}.supabase.co`);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fake-key");
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "fake@example.invalid");
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "fake-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("live sheet read", () => {
  it("only reads the grounded guest tab using its actual grid bounds", async () => {
    request.mockResolvedValueOnce({ data: { sheets: [{ properties: { sheetId: GUEST_SHEET.sheetId,
      title: GUEST_SHEET.title, gridProperties: { rowCount: 997, columnCount: 25 } } }] } });
    request.mockResolvedValueOnce({ data: { values: [["header"]] } });
    const result = await readGuestSheet();
    expect(result.values).toEqual([["header"]]);
    expect(decodeURIComponent(request.mock.calls[1][0].url)).toContain("'게스트_마스터'!A1:Y997");
    expect(request.mock.calls[1][0].params.valueRenderOption).toBe("FORMATTED_VALUE");
  });
  it("blocks real customer reads for the shared test database", async () => {
    vi.stubEnv("SUPABASE_URL", "https://qgqnktipmmamzowbxcmg.supabase.co");
    await expect(readGuestSheet()).rejects.toThrow("LIVE_SOURCE_REQUIRES_PRODUCTION_DATABASE");
    expect(request).not.toHaveBeenCalled();
  });
  it("fails closed when the tab identity changes", async () => {
    request.mockResolvedValue({ data: { sheets: [] } });
    await expect(readGuestSheet()).rejects.toThrow("SOURCE_TAB_CHANGED");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not expose provider errors or credentials", async () => {
    request.mockRejectedValue(new Error("private-key-and-customer-data"));
    await expect(readGuestSheet()).rejects.toThrow(/^GOOGLE_SHEETS_READ_FAILED$/);
  });
});
