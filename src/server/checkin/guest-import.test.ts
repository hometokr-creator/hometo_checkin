import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { previewGuestImport } from "./guest-import";
const headers = ["게스트ID*", "이름*", "연락처", "고객상태*", "성별", "학교또는직장명", "실제 계약 시작일", "실제 계약 종료일"];
const guest = ["G001", "가상 고객", "010-0000-0000", "계약중", "여성", "가상대학교", "2026-01-31", "2027-01-31"];
describe("guest import preview", () => {
  it("maps by header even when columns move, preserving selected fields and phone zero", () => {
    const result = previewGuestImport([[...headers].reverse(), [...guest].reverse()]);
    expect(result.problems).toEqual([]);
    expect(result.guests[0]).toMatchObject({ guestId: "G001", phone: "01000000000", gender: "여성", school: "가상대학교" });
  });
  it("skips blank and ID-only rows but reports incomplete customers", () => {
    const result = previewGuestImport([headers, [], ["G002"], ["G003", "가상 고객"]]);
    expect(result.skippedRows).toEqual([3]);
    expect(result.guests).toHaveLength(1);
    expect(result.problems).toContainEqual({ row: 4, field: "contractStart", code: "missing" });
  });
  it("marks all duplicate IDs rather than letting the last customer overwrite the first", () => {
    expect(previewGuestImport([headers, guest, guest]).problems).toEqual([
      { row: 2, field: "guestId", code: "duplicate" }, { row: 3, field: "guestId", code: "duplicate" },
    ]);
  });
  it.each(["2026-02-29", "2026-02-31", "01/31/2026", "46053"])("rejects ambiguous or invalid date %s", (date) => {
    const row = [...guest]; row[6] = date;
    expect(previewGuestImport([headers, row]).problems).toContainEqual({ row: 2, field: "contractStart", code: "invalid" });
  });
  it("rejects reversed dates and malformed phone without silently removing letters", () => {
    const row = [...guest]; row[2] = "010abc00000000"; row[7] = "2025-01-01";
    expect(previewGuestImport([headers, row]).problems).toEqual([
      { row: 2, field: "phone", code: "invalid" }, { row: 2, field: "contractEnd", code: "invalid" },
    ]);
  });
  it("does not substitute desired dates or memo text for confirmed dates", () => {
    const row = [...guest]; row[6] = ""; row[7] = "";
    const result = previewGuestImport([[...headers, "입주희망일"], [...row, "2026-01-31"]]);
    expect(result.guests[0].contractStart).toBeNull();
    expect(result.problems).toHaveLength(2);
  });
  it("stops the batch on missing or duplicate headers", () => {
    expect(() => previewGuestImport([headers.slice(1), guest])).toThrow();
    expect(() => previewGuestImport([[...headers, "게스트ID*"], guest])).toThrow();
  });
});
