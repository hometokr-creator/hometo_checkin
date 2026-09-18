import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), from: vi.fn(), rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("./session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../db", () => ({ getDb: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { loadAdminResponses, readAllRows } from "./responses";
import { mapResponse, mapUrgent, initiallyPositive, type ResponseRecord } from "./response-records";
import { setResponseReviewed } from "@/features/review-response/actions";
import { filterResponses, initialFilters, previousResponses, responseSummary, sortResponses } from "@/domains/admin-responses/model";

const id = "11111111-1111-4111-8111-111111111111";
function record(): ResponseRecord {
  return {
    id, session_id: "session", outcome: "reported", submitted_at: "2026-09-08T01:00:00Z", reviewed_at: null,
    scenario_id: "monthly-guest", scenario_version: 1, answers_json: { responses: { monthlyStatus: "ok" } },
    issues: [{ id: "issue", tag: "facility", detail: "climate", free_text: "난방 문의" }],
    session: { id: "session", participant_id: "person", persona_type: "guest", round_type: "monthly", round_key: "month", scenario_id: "monthly-guest", scenario_version: 1, triage_rule_version: 1, event_type: null, event_context_snapshot: null, status: "completed", answer_expires_at: "2026-09-20T00:00:00Z",
      participant: { id: "person", display_name: "가상 고객", phone: "TEST-NOT-A-PHONE", property_label: "테스트 101호", host_name: null, contract_start_date: "2026-01-01", contract_end_date: "2027-01-01" }, interests: [] },
  };
}
function query(result: { data: unknown; error: unknown }) {
  const chain = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), neq: vi.fn(), order: vi.fn(), range: vi.fn(), maybeSingle: vi.fn() };
  for (const method of [chain.select, chain.eq, chain.in, chain.neq, chain.order]) method.mockReturnValue(chain);
  chain.range.mockResolvedValue(result); chain.maybeSingle.mockResolvedValue(result);
  return chain;
}
beforeEach(() => { vi.clearAllMocks(); mocks.requireAdmin.mockResolvedValue({ id: "admin" }); mocks.rpc.mockResolvedValue({ data: "2026-09-08", error: null }); });

describe("admin response mapping", () => {
  it("uses existing chip labels and does not serialize raw answers or triage", () => {
    const dto = mapResponse(record())!;
    expect(dto.issues[0].detailLabel).toBe("난방·에어컨");
    expect(dto.initiallyPositive).toBe(true);
    expect(dto).not.toHaveProperty("answers_json");
    expect(dto).not.toHaveProperty("overall_triage");
  });
  it("excludes events and cancelled sessions defensively", () => {
    for (const change of [{ round_type: "event" }, { status: "cancelled" }]) {
      const row = record(); Object.assign(row.session, change); expect(mapResponse(row)).toBeNull();
    }
  });
  it("does not interpret unknown versions with current labels", () => {
    const row = record(); row.scenario_version = 99;
    const dto = mapResponse(row)!;
    expect(dto.labelsAvailable).toBe(false); expect(dto.initiallyPositive).toBe(false);
    expect(dto.issues[0]).toMatchObject({ detailLabel: "선택 내용 확인 불가", freeText: "난방 문의" });
  });
  it("requires renewal support status instead of renewal intent", () => {
    expect(initiallyPositive("monthly-renewal", { renewalIntent: "renew", renewalSupportStatus: "needed" })).toBe(false);
    expect(initiallyPositive("monthly-renewal", { renewalIntent: "undecided", renewalSupportStatus: "none" })).toBe(true);
  });
  it("does not turn completed urgent paths into pending cases", () => {
    const session = { ...record().session, response: null, status: "open" };
    expect(mapUrgent({ session_id: "session", reached_at: "2026-09-08", session })).not.toBeNull();
    expect(mapUrgent({ session_id: "session", reached_at: "2026-09-08", session: { ...session, response: { id } } })).toBeNull();
  });
});
describe("list semantics", () => {
  it("sorts urgent by issue tag and does not reorder based on review status", () => {
    const base = mapResponse(record())!;
    const urgent = { ...base, id: "urgent", outcome: "reported" as const, issues: [{ ...base.issues[0], tag: "urgent" as const }], submittedAt: "2026-08-20T00:00:00Z" };
    const okay = { ...base, id: "okay", issues: [], outcome: "ok" as const };
    const values = [okay, base, urgent];
    expect(sortResponses(values).map((r) => r.id)).toEqual(["urgent", id, "okay"]);
    expect(sortResponses(values.map((r) => ({ ...r, reviewedAt: "2026-09-09" }))).map((r) => r.id)).toEqual(["urgent", id, "okay"]);
    expect(responseSummary(values)).toEqual({ total: 3, reported: 2, urgent: 1 });
  });
  it("filters by Korean calendar dates, not UTC midnight", () => {
    const base = { ...mapResponse(record())!, submittedAt: "2026-09-07T15:00:00Z" };
    const filter = { ...initialFilters("2026-09-08T00:00:00Z"), from: "2026-09-08", to: "2026-09-08" };
    expect(filterResponses([base], filter)).toHaveLength(1);
    expect(filterResponses([base], { ...filter, from: "2026-09-09" })).toEqual([]);
    expect(filterResponses([base], { ...filter, from: "2026-02-30" })).toEqual([]);
  });
  it("retains history outside current dates and does not mix same-name people", () => {
    const base = mapResponse(record())!;
    const old = { ...base, id: "old", submittedAt: "2026-01-01T00:00:00Z" };
    const other = { ...old, id: "other", participant: { ...old.participant, id: "different-person" } };
    expect(previousResponses([base, old, other], base).map((r) => r.id)).toEqual(["old"]);
  });
});
describe("server query boundary", () => {
  it("never accesses the DB when authentication fails", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("redirect"));
    await expect(loadAdminResponses()).rejects.toThrow("redirect");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("distinguishes missing migration from an empty inbox", async () => {
    mocks.from.mockReturnValue(query({ data: null, error: { code: "42703" } }));
    expect(await loadAdminResponses()).toEqual({ ok: false, reason: "setup" });
    mocks.from.mockReturnValue(query({ data: [], error: null }));
    expect(await loadAdminResponses()).toMatchObject({ ok: true, data: { responses: [], urgentPending: [] } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reads past a server row cap without silently truncating", async () => {
    const rows = Array.from({ length: 1200 }, (_, index) => index);
    const read = vi.fn(async (from: number) => ({ data: rows.slice(from, from + 100), error: null }));
    expect(await readAllRows(read)).toEqual(rows);
    expect(read).toHaveBeenCalledTimes(13);
  });
});
describe("manual review action", () => {
  it("authenticates before validation and DB access", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("redirect"));
    await expect(setResponseReviewed(id, true)).rejects.toThrow("redirect");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("writes only the reviewed RPC parameters and revalidates after success", async () => {
    mocks.from.mockReturnValue(query({ data: { id }, error: null }));
    expect(await setResponseReviewed(id, true)).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("mark_checkin_response_reviewed", { p_response_id: id, p_reviewed: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/responses");
  });
  it("rejects unavailable, missing or out-of-scope responses without writing", async () => {
    mocks.from.mockReturnValue(query({ data: null, error: null }));
    expect(await setResponseReviewed(id, false)).toMatchObject({ ok: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(await setResponseReviewed("invalid", true)).toMatchObject({ ok: false });
  });
  it("does not report a failed RPC as saved", async () => {
    mocks.from.mockReturnValue(query({ data: { id }, error: null }));
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    const result = await setResponseReviewed(id, false);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain("private database detail");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
