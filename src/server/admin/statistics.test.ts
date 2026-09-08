import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), from: vi.fn() }));
vi.mock("./session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../db", () => ({ getDb: () => ({ from: mocks.from }) }));
import { buildStatsData, formatRatio, parseStatsFilters, quantile, type StatsSession } from "@/domains/admin-responses/statistics";
import { loadAdminStats, mapStatsSession, type StatsRecord } from "./statistics";

const now = "2026-09-08T12:00:00Z", filters = { from: "2026-09-01", to: "2026-09-08", round: "all" as const };
function session(id: string, overrides: Partial<StatsSession> = {}): StatsSession {
  return { id, participantId: id, round: "monthly", status: "completed", expiresAt: "2026-09-15T00:00:00Z",
    deliveries: [{ kind: "initial", status: "sent", sentAt: "2026-09-01T00:00:00Z" }],
    progress: [{ key: "main", label: "잘 지내셨어요?", at: "2026-09-02T00:00:00Z", stage: "entry", urgent: false }],
    response: { at: "2026-09-02T00:01:00Z", outcome: "reported", positive: true, textAnswered: true, textProvided: true, issues: [{ tag: "facility", detail: "난방·에어컨", hasText: true }] }, interest: null,
    ...overrides };
}
const summary = (sessions: StatsSession[]) => buildStatsData(sessions, filters, now).summary;
beforeEach(() => { vi.clearAllMocks(); mocks.requireAdmin.mockResolvedValue({ id: "admin" }); });

describe("small sample and period rules", () => {
  it("distinguishes zero, nine and ten denominators", () => {
    expect(formatRatio({ n: 0, d: 0 })).toBe("계산 불가");
    expect(formatRatio({ n: 1, d: 9 })).toBe("1/9");
    expect(formatRatio({ n: 1, d: 10 })).toBe("10% (1/10)");
    expect(formatRatio({ n: 0, d: 3 })).toBe("0/3");
    expect(formatRatio({ n: 4, d: 3 })).toBe("계산 불가");
  });
  it("rejects invalid dates, reversed periods, array params and event filters", () => {
    for (const params of [{ from: "2026-02-30" }, { from: "2026-10-01", to: "2026-09-01" }, { round: "event" }, { from: ["2026-09-01"] }]) expect(parseStatsFilters(params, now)).toBeNull();
    expect(parseStatsFilters({}, now)?.round).toBe("all");
  });
  it("uses initial delivery date in Korea and observes responses after the period", () => {
    const row = session("one", { deliveries: [{ kind: "initial", status: "sent", sentAt: "2026-08-31T15:00:00Z" }] });
    expect(buildStatsData([row], { ...filters, to: "2026-09-01" }, now).summary.completed).toBe(1);
  });
  it("deduplicates initial retries and uses the first successful initial", () => {
    const row = session("one"); row.deliveries.push({ ...row.deliveries[0], sentAt: "2026-09-03T00:00:00Z" });
    expect(summary([row]).sent).toBe(1);
    row.deliveries.push({ ...row.deliveries[0], sentAt: "2026-08-01T00:00:00Z" });
    expect(summary([row]).sent).toBe(0);
  });
  it("does not treat an unsent or manual response as a delivered session", () => {
    const report = buildStatsData([session("manual", { deliveries: [] })], filters, now);
    expect(report.summary.sent).toBe(0); expect(report.withoutDeliveryResponses).toBe(1);
    expect(formatRatio(report.summary.metrics.participation)).toBe("계산 불가");
  });
  it("does not invent a sent timestamp", () => {
    const report = buildStatsData([session("missing", { deliveries: [{ kind: "initial", status: "sent", sentAt: null }] })], filters, now);
    expect(report.summary.sent).toBe(0); expect(report.missingDeliveryTimes).toBe(1);
  });
  it("excludes cancelled and event rows and future observations", () => {
    expect(summary([session("cancelled", { status: "cancelled" }), session("event", { round: "event" as StatsSession["round"] })]).sent).toBe(0);
    const future = session("future"); future.response!.at = "2026-09-09T00:00:00Z";
    expect(summary([future]).completed).toBe(0);
  });
});
describe("cohort intersections and independent units", () => {
  it("does not exceed 100 percent or go negative when completed sessions lack progress", () => {
    const report = summary([session("no-progress", { progress: [] }), session("incomplete", { response: null, status: "open" }), session("complete")]);
    expect(report.metrics.participation).toEqual({ n: 2, d: 3 });
    expect(report.metrics.completion).toEqual({ n: 1, d: 2 });
    expect(report.metrics.incomplete).toEqual({ n: 1, d: 2 });
    expect(report.completedWithoutProgress).toBe(1);
  });
  it("separates issue-description coverage from completed-session writing", () => {
    const row = session("two"); row.response!.issues.push({ tag: "settlement", detail: null, hasText: false });
    const report = summary([row]);
    expect(report.metrics.description).toEqual({ n: 1, d: 2 });
    expect(report.metrics.writing).toEqual({ n: 1, d: 1 });
    expect(report.metrics.reported).toEqual({ n: 1, d: 1 });
    expect(report.tags.find((r) => r.label === "시설")).toMatchObject({ n: 1, d: 2 });
  });
  it("derives urgent rate from issue tag rather than outcome", () => {
    const row = session("one"); row.response!.outcome = "urgent";
    expect(summary([row]).metrics.urgent.n).toBe(0);
    row.response!.issues[0].tag = "urgent";
    expect(summary([row]).metrics.urgent.n).toBe(1);
  });
  it("uses submitted-topic sessions and allows multiple topics per person", () => {
    const row = session("one", { interest: { exposedAt: "2026-09-02", clickedAt: "2026-09-02", submittedAt: "2026-09-02", topics: ["kitchen", "cleaning"] } });
    const report = summary([row, session("none")]);
    expect(report.metrics.interestPerCompleted).toEqual({ n: 1, d: 2 });
    expect(report.metrics.interestPerExposed).toEqual({ n: 1, d: 1 });
    expect(report.topics.filter((t) => t.n === 1)).toHaveLength(2);
    expect(report.topics.every((t) => t.d === 1)).toBe(true);
  });
  it("counts repeat issues using pre-period history without assuming unresolved cases", () => {
    const earlier = session("earlier", { participantId: "person", deliveries: [{ kind: "initial", status: "sent", sentAt: "2026-07-01" }] });
    earlier.response!.at = "2026-07-02";
    const current = session("current", { participantId: "person" });
    const other = session("other-person");
    expect(summary([earlier, current, other]).repeated).toBe(1);
  });
  it("separates pending and expired and detects urgent paths without a response", () => {
    const pending = session("pending", { response: null, status: "open" }); pending.progress[0].urgent = true;
    const expired = session("expired", { response: null, status: "open", expiresAt: "2026-09-07" });
    const report = summary([pending, expired]);
    expect(report.pending).toBe(1); expect(report.expired).toBe(1); expect(report.urgentPending).toBe(1);
    expect(report.metrics.reported).toEqual({ n: 0, d: 0 });
  });
  it("does not invent order for different steps recorded at the same instant", () => {
    const row = session("incomplete", { response: null }); row.progress.push({ ...row.progress[0], key: "other" });
    expect(summary([row]).lastSteps[0].label).toContain("단계 특정 불가");
  });
  it("deduplicates reminder sessions and only counts submissions after reminder", () => {
    const after = session("after"); after.deliveries.push({ kind: "reminder", status: "sent", sentAt: "2026-09-01T12:00:00Z" }, { kind: "reminder", status: "sent", sentAt: "2026-09-01T13:00:00Z" });
    const before = session("before"); before.deliveries.push({ kind: "reminder", status: "sent", sentAt: "2026-09-03T00:00:00Z" });
    expect(summary([after, before]).metrics.reminder).toEqual({ n: 1, d: 2 });
  });
});
describe("duration and per-round comparison", () => {
  it("uses interpolated quartiles and separates intervals over thirty minutes", () => {
    expect(quantile([10, 20, 30, 40], .25)).toBe(17.5); expect(quantile([], .5)).toBeNull();
    const short = session("short"), long = session("long"), negative = session("negative"), missing = session("missing", { progress: [] });
    long.response!.at = "2026-09-02T03:00:00Z";
    negative.response!.at = "2026-09-01T23:59:00Z";
    expect(summary([short, long, negative, missing]).duration).toEqual({ median: 60, p25: 60, p75: 60, count: 1, resumed: 1, missing: 2 });
  });
  it("supports all metrics under each regular round", () => {
    const report = buildStatsData([session("monthly"), session("first", { round: "monthly-first" })], { ...filters, round: "monthly" }, now);
    expect(report.summary.sent).toBe(1); expect(report.rounds).toHaveLength(4);
    expect(report.rounds.find((r) => r.round === "monthly-first")!.summary.sent).toBe(1);
    expect(report.rounds.every((r) => Object.keys(r.summary.metrics).length === 12)).toBe(true);
  });
});
describe("server stats access", () => {
  it("authenticates before parsing filters or querying", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("redirect"));
    await expect(loadAdminStats({ round: "invalid" })).rejects.toThrow("redirect");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not query for invalid filters", async () => {
    expect(await loadAdminStats({ round: "event" })).toEqual({ ok: false, reason: "filters" });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("maps scenario metadata without exposing raw text or participant contact data", () => {
    const row: StatsRecord = { id: "one", participant_id: "person", persona_type: "guest", round_type: "monthly", round_key: "monthly", scenario_id: "monthly-guest", scenario_version: 1, triage_rule_version: 1, event_type: null, event_context_snapshot: null, status: "completed", answer_expires_at: "2026-09-15", deliveries: [], interests: [], progress: [{ step_id: "q_chip_urgent", reached_at: "2026-09-02" }],
      response: { submitted_at: "2026-09-02", outcome: "reported", scenario_id: "monthly-guest", scenario_version: 1, answers_json: { responses: { monthlyStatus: "ok", issueFreeText: "provided" } }, issues: [{ tag: "facility", detail: "climate", free_text: "private free text" }] } };
    const dto = mapStatsSession(row)!;
    expect(dto.response).toMatchObject({ positive: true, textAnswered: true, textProvided: true });
    expect(dto.progress[0].urgent).toBe(true);
    expect(JSON.stringify(dto)).not.toContain("private free text");
  });
});
