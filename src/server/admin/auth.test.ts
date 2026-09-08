import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn(), signInWithOtp: vi.fn(),
  create: vi.fn(), cookieSet: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  getAll: () => [{ name: "checkin-admin-auth.0", value: "admin-session" }, { name: "checkin-resident", value: "resident-session" }],
  set: mocks.cookieSet,
}) }));
vi.mock("../env", () => ({ adminEnvironment: () => ({ emails: ["admin@example.com"], origin: "https://checkin.example.com" }) }));
vi.mock("./auth-client", () => ({
  createAdminAuth: mocks.create,
  adminAuthForRender: mocks.create,
  adminAuthForAction: mocks.create,
}));
import { NextRequest } from "next/server";
import { requireAdmin } from "./session";
import { adminProxy } from "./proxy";
import { confirmAdmin } from "./confirm";
import { isAllowedAdmin, isPublicAdminPath, normalizeAdminEmail } from "./policy";
import { requestAdminLogin, logoutAdmin } from "@/features/admin-auth/actions";

const user = { id: "admin-id", email: "admin@example.com", email_confirmed_at: "2026-09-08T00:00:00Z" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { user }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.create.mockReturnValue({ auth: mocks });
});

describe("admin identity policy", () => {
  it("normalizes email but requires an exact allowlist match and verification", () => {
    expect(normalizeAdminEmail(" ADMIN@Example.com ")).toBe("admin@example.com");
    expect(isAllowedAdmin({ ...user, email: "ADMIN@example.com" }, ["admin@example.com"])).toBe(true);
    expect(isAllowedAdmin({ ...user, email_confirmed_at: undefined }, [user.email])).toBe(false);
    expect(isAllowedAdmin({ ...user, email: "admin@example.com.evil.test" }, [user.email])).toBe(false);
    expect(isAllowedAdmin(null, [user.email])).toBe(false);
    expect(normalizeAdminEmail(new Blob())).toBeNull();
  });
  it("only exempts exact authentication endpoints", () => {
    expect(isPublicAdminPath("/admin/login")).toBe(true);
    expect(isPublicAdminPath("/admin/auth/confirm")).toBe(true);
    expect(isPublicAdminPath("/admin/login/responses")).toBe(false);
  });
  it("checks server-confirmed identity at the query boundary", async () => {
    expect(await requireAdmin()).toEqual({ id: user.id, email: user.email });
    expect(mocks.getUser).toHaveBeenCalledOnce();
    mocks.getUser.mockResolvedValue({ data: { user: { ...user, email: "outsider@example.com" } }, error: null });
    await expect(requireAdmin()).rejects.toThrow("redirect:/admin/login");
  });
});

describe("admin request boundary", () => {
  it("allows login without an auth lookup", async () => {
    const response = await adminProxy(new NextRequest("https://checkin.example.com/admin/login"));
    expect(response.status).toBe(200);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and unlisted sessions without retaining query data", async () => {
    for (const identity of [null, { ...user, email: "other@example.com" }]) {
      mocks.getUser.mockResolvedValue({ data: { user: identity }, error: null });
      const response = await adminProxy(new NextRequest("https://checkin.example.com/admin/responses?private=value"));
      expect(response.headers.get("location")).toBe("https://checkin.example.com/admin/login");
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });
  it("fails closed when the Auth service fails", async () => {
    mocks.getUser.mockRejectedValue(new Error("unavailable"));
    expect((await adminProxy(new NextRequest("https://checkin.example.com/admin/stats"))).status).toBe(303);
  });
  it("preserves refreshed cookies on redirects", async () => {
    mocks.create.mockImplementation((cookies) => {
      cookies.setAll([{ name: "checkin-admin-auth.0", value: "refreshed", options: { path: "/admin", httpOnly: true } }], { "Cache-Control": "private, no-store" });
      return { auth: mocks };
    });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await adminProxy(new NextRequest("https://checkin.example.com/admin"));
    expect(response.cookies.get("checkin-admin-auth.0")?.value).toBe("refreshed");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

describe("magic-link completion", () => {
  it("rejects missing tokens and other OTP types before contacting Auth", async () => {
    for (const query of ["", "?token_hash=abc&type=recovery"]) {
      const response = await confirmAdmin(new NextRequest(`https://checkin.example.com/admin/auth/confirm${query}`));
      expect(response.headers.get("location")).toContain("/admin/login?error=link");
    }
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it("only redirects verified allowlisted users to the fixed admin destination", async () => {
    const response = await confirmAdmin(new NextRequest("https://checkin.example.com/admin/auth/confirm?token_hash=abc&type=email&next=https://evil.test"));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "email" });
    expect(response.headers.get("location")).toBe("https://checkin.example.com/admin/responses");
  });
  it("rejects expired links", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    const response = await confirmAdmin(new NextRequest("https://checkin.example.com/admin/auth/confirm?token_hash=abc&type=email"));
    expect(response.headers.get("location")).toContain("error=link");
  });
  it("clears cookies for an unlisted user even if signout throws", async () => {
    mocks.create.mockImplementation((cookies) => {
      cookies.setAll([{ name: "checkin-admin-auth", value: "denied-token", options: { path: "/admin" } }], {});
      return { auth: mocks };
    });
    mocks.verifyOtp.mockResolvedValue({ data: { user: { ...user, email: "denied@example.com" } }, error: null });
    mocks.signOut.mockRejectedValue(new Error("network"));
    const response = await confirmAdmin(new NextRequest("https://checkin.example.com/admin/auth/confirm?token_hash=abc&type=email"));
    expect(response.cookies.get("checkin-admin-auth")?.value).toBe("");
    expect(response.headers.get("location")).toContain("error=link");
  });
});

describe("magic-link request", () => {
  it("clears only admin cookies when logout cannot reach Auth", async () => {
    mocks.signOut.mockRejectedValue(new Error("network"));
    await expect(logoutAdmin()).rejects.toThrow("redirect:/admin/login");
    expect(mocks.cookieSet).toHaveBeenCalledOnce();
    expect(mocks.cookieSet).toHaveBeenCalledWith("checkin-admin-auth.0", "", expect.objectContaining({ path: "/admin", maxAge: 0 }));
  });
  it("never requests email delivery to an unlisted address", async () => {
    const form = new FormData(); form.set("email", "stranger@example.com");
    await requestAdminLogin("", form);
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });
  it("uses a configured origin and disables automatic signup", async () => {
    const form = new FormData(); form.set("email", " ADMIN@example.com ");
    expect(await requestAdminLogin("", form)).toContain("보냈습니다");
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: user.email, options: {
      shouldCreateUser: false, emailRedirectTo: "https://checkin.example.com/admin/auth/confirm",
    } });
  });
  it("does not expose provider errors", async () => {
    mocks.signInWithOtp.mockRejectedValue(new Error("provider-secret"));
    const form = new FormData(); form.set("email", user.email);
    expect(await requestAdminLogin("", form)).not.toContain("provider-secret");
  });
});
