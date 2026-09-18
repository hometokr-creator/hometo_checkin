"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { adminEnvironment } from "@/server/env";
import { adminAuthForAction } from "@/server/admin/auth-client";
import { normalizeAdminEmail } from "@/server/admin/policy";

export async function requestAdminLogin(_previous: string, form: FormData): Promise<string> {
  const email = normalizeAdminEmail(form.get("email"));
  if (!email) return "이메일 주소를 확인해 주세요.";
  try {
    const env = adminEnvironment();
    if (!env.emails.includes(email)) return "로그인 링크를 보낼 수 없습니다. 운영자 이메일을 확인해 주세요.";
    const auth = await adminAuthForAction();
    const { error } = await auth.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: new URL("/admin/auth/confirm", env.origin).href },
    });
    if (error) return "로그인 링크를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return "로그인 링크를 보냈습니다. 이메일을 확인해 주세요.";
  } catch {
    return "지금은 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.";
  }
}

export async function logoutAdmin() {
  try {
    const auth = await adminAuthForAction();
    await auth.auth.signOut({ scope: "local" });
  } catch {
    // Local logout must still work if Auth is temporarily unreachable.
  }
  // Explicit local cleanup also handles a temporary Auth network failure.
  const store = await cookies();
  store.getAll().filter(({ name }) => name === "checkin-admin-auth" || name.startsWith("checkin-admin-auth.") || name.startsWith("checkin-admin-auth-")).forEach(({ name }) => {
    store.set(name, "", { path: "/admin", maxAge: 0, httpOnly: true, sameSite: "lax", secure: adminEnvironment().secure });
  });
  redirect("/admin/login");
}
