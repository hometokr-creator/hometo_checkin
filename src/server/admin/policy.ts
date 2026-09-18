import "server-only";

export function normalizeAdminEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function isAllowedAdmin(
  user: { email?: string; email_confirmed_at?: string } | null,
  emails: readonly string[],
) {
  const email = normalizeAdminEmail(user?.email);
  return !!user?.email_confirmed_at && email !== null && emails.includes(email);
}

export function isPublicAdminPath(pathname: string) {
  return pathname === "/admin/login" || pathname === "/admin/auth/confirm";
}
