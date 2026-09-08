import "server-only";
import { redirect } from "next/navigation";
import { adminEnvironment } from "../env";
import { adminAuthForRender } from "./auth-client";
import { isAllowedAdmin } from "./policy";

// Call at every privileged query/mutation boundary, not just in layouts.
export async function requireAdmin() {
  const auth = await adminAuthForRender();
  const { data, error } = await auth.auth.getUser();
  if (error || !isAllowedAdmin(data.user, adminEnvironment().emails)) redirect("/admin/login");
  return { id: data.user!.id, email: data.user!.email! };
}
