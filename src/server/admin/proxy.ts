import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminAuth } from "./auth-client";
import { adminEnvironment } from "../env";
import { isAllowedAdmin, isPublicAdminPath } from "./policy";

export async function adminProxy(request: NextRequest) {
  if (isPublicAdminPath(request.nextUrl.pathname)) return NextResponse.next();
  let response = NextResponse.next({ request });
  let allowed = false;
  try {
    const auth = createAdminAuth({
      getAll: () => request.cookies.getAll(),
      setAll: (values, headers) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        const previousCookies = response.cookies.getAll();
        response = NextResponse.next({ request });
        previousCookies.forEach((cookie) => response.cookies.set(cookie));
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    });
    const { data, error } = await auth.auth.getUser();
    allowed = !error && isAllowedAdmin(data.user, adminEnvironment().emails);
  } catch {
    // Missing configuration or an unavailable Auth service must fail closed.
  }
  if (!allowed) {
    const target = request.nextUrl.clone();
    target.pathname = "/admin/login";
    target.search = "";
    const denied = NextResponse.redirect(target, 303);
    response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
    response = denied;
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
