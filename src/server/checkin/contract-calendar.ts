/** Date-only calendar arithmetic. No DB access, token creation, or message sending. */
export type ScheduledRound = "onboarding-d7" | "monthly-first" | "monthly" | "monthly-renewal";
export interface ContractRound {
  key: string;
  date: string;
  type: ScheduledRound;
}
export function dateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("INVALID_CONTRACT_DATE");
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("INVALID_CONTRACT_DATE");
  return date;
}
export function koreanToday(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_CLOCK");
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
function monthFromAnchor(start: Date, offset: number): string {
  const target = new Date(start.getTime());
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + offset);
  const last = new Date(target.getTime());
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  target.setUTCDate(Math.min(start.getUTCDate(), last.getUTCDate()));
  return target.toISOString().slice(0, 10);
}
export interface CalendarPolicy {
  /** Requires an explicit policy choice; short contracts are never guessed. */
  shortContract: "hold" | "onboarding-only";
  singleMonthly: "hold" | "renewal";
  renewal?: boolean;
}
export function contractCalendar(startDate: string, endDate: string, notBefore: string, policy: CalendarPolicy) {
  const start = dateOnly(startDate), end = dateOnly(endDate);
  dateOnly(notBefore);
  if (end <= start) throw new Error("INVALID_CONTRACT_RANGE");
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  const monthly: ContractRound[] = [];
  for (let offset = 1; offset <= months; offset++) {
    const date = monthFromAnchor(start, offset);
    if (date >= endDate) break; // No new round on checkout/end day.
    monthly.push({ key: `month:${offset}`, date, type: offset === 1 && !policy.renewal ? "monthly-first" : "monthly" });
  }
  if ((!monthly.length && policy.shortContract === "hold") || (monthly.length === 1 && policy.singleMonthly === "hold")) {
    return { rounds: [] as ContractRound[], held: "SHORT_CONTRACT_POLICY_REQUIRED" as const, skippedPast: 0 };
  }
  if (monthly.length) monthly[monthly.length - 1].type = "monthly-renewal";
  const day7Date = new Date(start.getTime() + 7 * 86400000);
  const day7 = day7Date.toISOString().slice(0, 10);
  const rounds: ContractRound[] = !policy.renewal && day7Date < end ? [{ key: "day:7", date: day7, type: "onboarding-d7" }, ...monthly] : monthly;
  return { rounds: rounds.filter(round => round.date >= notBefore), held: null,
    skippedPast: rounds.filter(round => round.date < notBefore).length };
}
