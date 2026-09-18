import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GUEST_SHEET, planGuestSync, type GuestSheetSnapshot } from "./guest-sync-plan";

const headers = ["게스트ID*", "이름*", "연락처", "고객상태*", "성별", "학교또는직장명", "실제 계약 시작일", "실제 계약 종료일"];
const row = ["G900001", "가상 고객", "010-0000-0000", "계약중", "여성", "가상대학교", "2026-08-30", "2027-02-28"];
const snapshot = (rows: unknown[][]): GuestSheetSnapshot => ({ ...GUEST_SHEET, readAt: "2026-09-16T01:00:00Z", values: [headers, ...rows] });

describe("guest sync eligibility", () => {
  it("accepts complete contracts and keeps only approved business fields", () => {
    const plan = planGuestSync(snapshot([row, ["G900002"], []]));
    expect(plan.complete).toBe(1);
    expect(plan.skippedRows).toBe(1);
    expect(plan.guests[0]).toMatchObject({ guest_id: "G900001", phone: "01000000000", gender: "여성", school: "가상대학교" });
    expect(plan.guests[0]).not.toHaveProperty("source_fields");
    expect(plan.guests[0]).not.toHaveProperty("note_detail");
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
  it("does not forward excluded columns even from an old full-sheet sender", () => {
    const input = snapshot([[...row, "private note", "other private value"]]);
    input.values[0] = [...headers, "특이사항상세", "나이"];
    const serialized = JSON.stringify(planGuestSync(input));
    expect(serialized).not.toContain("private");
    expect(serialized).not.toContain("source_fields");
    expect(serialized).not.toContain("note_detail");
  });

});
