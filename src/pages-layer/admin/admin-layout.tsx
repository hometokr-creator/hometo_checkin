import type { ReactNode } from "react";
import { requireAdmin } from "@/server/admin/session";
import { AdminShell } from "@/widgets/admin-shell/admin-shell";

export async function AdminProtectedLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <AdminShell>{children}</AdminShell>;
}
