import "server-only";
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import { adminEnvironment } from "../env";

export function createAdminAuth(cookies: CookieMethodsServer) {
  const env = adminEnvironment();
  return createServerClient(env.url, env.key, {
    cookies,
    cookieOptions: { name: "checkin-admin-auth", path: "/admin", httpOnly: true, sameSite: "lax", secure: env.secure },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

// RSC cannot write cookies. Proxy refreshes them before protected renders.
export async function adminAuthForRender() {
  const store = await cookies();
  return createAdminAuth({ getAll: () => store.getAll() });
}

export async function adminAuthForAction() {
  const store = await cookies();
  return createAdminAuth({
    getAll: () => store.getAll(),
    setAll: (values) => { values.forEach(({ name, value, options }) => store.set(name, value, options)); },
  });
}
