import { dateOnly } from "./contract-calendar";

export type DispatchMode = "disabled" | "dry-run" | "test" | "live";
export const ROUND_TEMPLATES: Record<string, string> = {
  "onboarding-d7": "hometo_d7_v1",
  "monthly-first": "hometo_first_v1",
  monthly: "hometo_monthly_v1",
  "monthly-renewal": "hometo_renewal_v1",
};
export function inDispatchWindow(now: Date): boolean {
  if (!Number.isFinite(now.getTime())) return false;
  const local = new Date(now.getTime() + 9 * 3600000);
  const ms = ((local.getUTCHours() * 60 + local.getUTCMinutes()) * 60 + local.getUTCSeconds()) * 1000 + local.getUTCMilliseconds();
  return ms >= 14 * 3600000 && ms <= 18 * 3600000;
}
export function dispatchDue(date: string, now: Date): boolean {
  dateOnly(date);
  return inDispatchWindow(now) && new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10) === date;
}
export function dispatchMode(env: Record<string, string | undefined>): DispatchMode {
  const mode = env.CHECKIN_DISPATCH_MODE ?? "disabled";
  if (!["disabled", "dry-run", "test", "live"].includes(mode)) throw new Error("INVALID_DISPATCH_MODE");
  if (["test", "live"].includes(mode) && env.VERCEL_ENV && env.VERCEL_ENV !== "production") {
    throw new Error("PREVIEW_SEND_BLOCKED");
  }
  if (mode === "live" && (env.VERCEL_ENV !== "production" ||
    env.SUPABASE_URL !== "https://rfwxpqekweizestlxomi.supabase.co" ||
    env.NHN_ALIMTALK_LIVE_SEND_ENABLED !== "true")) throw new Error("LIVE_SEND_BLOCKED");
  if (mode === "test" && env.NHN_ALIMTALK_TEST_SEND_ENABLED !== "true") throw new Error("TEST_SEND_DISABLED");
  return mode as DispatchMode;
}
