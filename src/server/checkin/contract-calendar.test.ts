import { describe, expect, it } from "vitest";
import { contractCalendar, koreanToday, type CalendarPolicy } from "./contract-calendar";
const policy: CalendarPolicy = { shortContract: "onboarding-only", singleMonthly: "renewal" };
describe("contract-based checkin calendar", () => {
  it("uses last monthly date, not thirty days before the contract end", () => {
    const result = contractCalendar("2026-02-18", "2027-02-18", "2026-02-18", policy);
    expect(result.rounds[0]).toEqual({ key: "day:7", date: "2026-02-25", type: "onboarding-d7" });
    expect(result.rounds[1]).toEqual({ key: "month:1", date: "2026-03-18", type: "monthly-first" });
    expect(result.rounds.at(-1)).toEqual({ key: "month:11", date: "2027-01-18", type: "monthly-renewal" });
    expect(result.rounds).toHaveLength(12);
  });
  it("returns to the original 31st after February, without monthly drift", () => {
    const result = contractCalendar("2026-01-31", "2026-05-31", "2026-01-31", policy);
    expect(result.rounds.map(r => r.date)).toEqual(["2026-02-07", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("clamps to leap day and preserves the original anchor after it", () => {
    const result = contractCalendar("2028-01-30", "2028-05-01", "2028-01-30", policy);
    expect(result.rounds.map(r => r.date)).toEqual(["2028-02-06", "2028-02-29", "2028-03-30", "2028-04-30"]);
  });
  it("handles a non-anniversary end date", () => {
    const result = contractCalendar("2026-02-18", "2026-06-03", "2026-02-18", policy);
    expect(result.rounds.at(-1)).toEqual({ key: "month:3", date: "2026-05-18", type: "monthly-renewal" });
  });
  it("filters past rounds after assigning first and renewal semantics", () => {
    const result = contractCalendar("2026-02-18", "2027-02-18", "2026-09-18", policy);
    expect(result.rounds[0]).toEqual({ key: "month:7", date: "2026-09-18", type: "monthly" });
    expect(result.skippedPast).toBe(7);
    expect(result.rounds.at(-1)?.type).toBe("monthly-renewal");
  });
  it("does not create onboarding on or after end day", () => {
    expect(contractCalendar("2026-09-01", "2026-09-08", "2026-09-01", policy).rounds).toEqual([]);
    expect(contractCalendar("2026-09-01", "2026-09-09", "2026-09-01", policy).rounds).toHaveLength(1);
  });
  it("replaces the only monthly round when explicitly selected", () => {
    expect(contractCalendar("2026-09-01", "2026-11-01", "2026-09-01", policy).rounds.at(-1)?.type).toBe("monthly-renewal");
  });
  it("holds unresolved short-contract policies", () => {
    const unresolved: CalendarPolicy = { shortContract: "hold", singleMonthly: "hold" };
    expect(contractCalendar("2026-09-01", "2026-09-20", "2026-09-01", unresolved).held).toBe("SHORT_CONTRACT_POLICY_REQUIRED");
    expect(contractCalendar("2026-09-01", "2026-11-01", "2026-09-01", unresolved).held).toBe("SHORT_CONTRACT_POLICY_REQUIRED");
  });
  it.each([["2026-02-30", "2027-01-01"], ["2026-09-01", "2026-09-01"], ["2026-09-01", "2026-08-01"], ["9/1/2026", "2027-01-01"]])("rejects invalid range %s %s", (start, end) => {
    expect(() => contractCalendar(start, end, "2026-09-01", policy)).toThrow();
  });
  it("starts renewals with monthly and still replaces their last round", () => {
    const result = contractCalendar("2026-09-01", "2027-03-01", "2026-09-01", { ...policy, renewal: true });
    expect(result.rounds[0]).toEqual({ key: "month:1", date: "2026-10-01", type: "monthly" });
    expect(result.rounds.at(-1)?.type).toBe("monthly-renewal");
    expect(result.rounds.some(r => ["onboarding-d7", "monthly-first"].includes(r.type))).toBe(false);
  });
  it("uses the Korean day boundary", () => {
    expect(koreanToday(new Date("2026-09-17T14:59:59Z"))).toBe("2026-09-17");
    expect(koreanToday(new Date("2026-09-17T15:00:00Z"))).toBe("2026-09-18");
  });
});
