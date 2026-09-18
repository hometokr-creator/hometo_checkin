import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminAuth } from "./auth-client";
import { adminEnvironment } from "../env";
import { isAllowedAdmin } from "./policy";

export async function confirmAdmin(request: NextRequest) {
  const target = request.nextUrl.clone();
  target.pathname = "/admin/login";
  target.search = "?error=link";
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  const token = request.nextUrl.searchParams.get("token_hash");
  if (!token || token.length > 1024 || request.nextUrl.searchParams.get("type") !== "email") return response;
  try {
    const auth = createAdminAuth({
      getAll: () => request.cookies.getAll(),
      setAll: (values, headers) => {
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    });
    const { data, error } = await auth.auth.verifyOtp({ token_hash: token, type: "email" });
    if (!error && isAllowedAdmin(data.user, adminEnvironment().emails)) {
      response.headers.set("Location", new URL("/admin/responses", adminEnvironment().origin).href);
    } else {
      await auth.auth.signOut({ scope: "local" });
      // Never return a non-allowlisted session, even if remote sign-out fails.
      response.cookies.getAll().forEach((cookie) => response.cookies.set({ ...cookie, value: "", maxAge: 0 }));
    }
  } catch {
    response.cookies.getAll().forEach((cookie) => response.cookies.set({ ...cookie, value: "", maxAge: 0 }));
  }
  return response;
}
