import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GUEST_SHEET, planGuestSync, type GuestSheetSnapshot } from "./guest-sync-plan";

const headers = ["게스트ID*", "이름*", "연락처", "고객상태*", "특이사항범주", "특이사항상세", "실제 계약 시작일", "실제 계약 종료일"];
const row = ["G900001", "가상 고객", "010-0000-0000", "계약중", "기타", "가상 메모", "2026-08-30", "2027-02-28"];
const snapshot = (rows: unknown[][]): GuestSheetSnapshot => ({ ...GUEST_SHEET, readAt: "2026-09-16T01:00:00Z", values: [headers, ...rows] });

describe("guest sync eligibility", () => {
  it("accepts complete contracts and preserves source notes separately", () => {
    const plan = planGuestSync(snapshot([row, ["G900002"], []]));
    expect(plan.complete).toBe(1);
    expect(plan.skippedRows).toBe(1);
    expect(plan.guests[0]).toMatchObject({ guest_id: "G900001", phone: "01000000000", note_category: "기타", note_detail: "가상 메모" });
    expect(plan.guests[0].source_fields["연락처"]).toBe("010-0000-0000");
  });
  it("keeps incomplete IDs in the plan to hold existing customers, without marking them importable", () => {
    const plan = planGuestSync(snapshot([["G900002", "가상 고객", "010-0000-0000"]]));
    expect(plan.complete).toBe(0);
    expect(plan.incomplete).toBe(1);
    expect(plan.guests[0].contract_start_date).toBeNull();
    expect(plan.guests[0].validation_errors).toContainEqual({ field: "contractStart", code: "missing" });
  });
  it.each(["2026-02-28", "2027-02-30", ""])("holds an invalid end date %s without guessing a correction", (end) => {
    const changed = [...row]; changed[7] = end;
    const plan = planGuestSync(snapshot([changed]));
    expect(plan.complete).toBe(0);
    expect(plan.guests[0].contract_end_date).toBeNull();
    expect(plan.guests[0].source_fields["실제 계약 종료일"]).toBe(end);
  });
  it("fails the whole snapshot for duplicate or missing IDs", () => {
    expect(() => planGuestSync(snapshot([row, row]))).toThrow("INVALID_OR_DUPLICATE_GUEST_ID");
    expect(() => planGuestSync(snapshot([["", "가상 고객"]]))).toThrow("INVALID_OR_DUPLICATE_GUEST_ID");
  });
  it("refuses an empty snapshot and a different tab instead of marking all customers missing", () => {
    expect(() => planGuestSync(snapshot([]))).toThrow("EMPTY_SNAPSHOT");
    expect(() => planGuestSync({ ...snapshot([row]), sheetId: 7 })).toThrow("WRONG_SOURCE");
  });
  it("does not use desired contract dates to qualify incomplete customers", () => {
    const input = snapshot([[...row.slice(0, 6), "", "", "2026-08-30"]]);
    input.values[0] = [...headers, "입주희망일"];
    expect(planGuestSync(input).complete).toBe(0);
  });
});
