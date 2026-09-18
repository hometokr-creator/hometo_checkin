import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../../scripts/google-apps-script/guest-sync.gs", import.meta.url), "utf8");
const headers = ["게스트ID*", "이름*", "연락처", "성별", "학교또는직장명", "고객상태*", "실제 계약 시작일", "실제 계약 종료일", "특이사항상세"];
const preview = { complete: 1, incomplete: 0, skippedRows: 0 };
const summary = { seen: 1, inserted: 1, updated: 0, unchanged: 0, excluded_incomplete: 0, held_existing: 0, missing_existing: 0, skipped_placeholders: 0 };
const response = (status = 200, body: unknown = { summary: preview }) => ({ getResponseCode: () => status, getContentText: () => JSON.stringify(body) });
function setup() {
  const raw: unknown[][] = [headers.slice(), ["G001", "가상 고객", "010-0000-0000", "여성", "가상대학교", "계약중", new Date("2026-08-29T15:00:00Z"), "2027-02-28", "EXCLUDED_PRIVATE_NOTE"]];
  const fetch = vi.fn<(url: string, options: { payload: string; headers: object; followRedirects: boolean }) => ReturnType<typeof response>>(() => response());
  const releaseLock = vi.fn();
  const log = vi.fn();
  const properties: Record<string, string> = { GUEST_SYNC_URL: "https://hometogether-checkin-web.vercel.app/api/integrations/guest-sheet", GUEST_SYNC_SECRET: "secret" };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getId: () => "14FEUBqR5mTd0QiIyW_uYEC2lH2xwbo46D_HNBrd49To",
      getSpreadsheetTimeZone: () => "Asia/Seoul",
      getSheets: () => [{ getSheetId: () => 1004515357, getName: () => "게스트_마스터",
        getLastRow: () => raw.length, getLastColumn: () => raw[0].length,
        getRange: () => ({ getValues: () => raw }) }]
    }) },
    PropertiesService: { getUserProperties: () => ({ getProperties: () => properties,
      setProperties: (values: Record<string, string>) => Object.assign(properties, values),
      deleteProperty: (key: string) => { delete properties[key]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock }) },
    Utilities: { getUuid: vi.fn(() => "00000000-0000-4000-8000-000000000001"),
      newBlob: (value: string) => ({ getBytes: () => Buffer.from(value) }), sleep: vi.fn(),
      formatDate: vi.fn((date: Date, timezone: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(date)) },
    UrlFetchApp: { fetch }, console: { log }
  };
  runInNewContext(source, context);
  return { context, fetch, releaseLock, log, raw, properties };
}
describe("Apps Script sender", () => {
  it("projects eight fields, normalizes Date cells in sheet timezone, and hides excluded values", () => {
    const { context, fetch, log, releaseLock } = setup();
    runInNewContext("previewGuests()", context);
    const options = fetch.mock.calls[0][1];
    const payload = JSON.parse(options.payload);
    expect(payload.dryRun).toBe(true);
    expect(payload.snapshot.values[0]).toEqual(headers.slice(0, 8));
    expect(payload.snapshot.values[1][6]).toBe("2026-08-30");
    expect(options.payload).not.toContain("EXCLUDED_PRIVATE_NOTE");
    expect(options.headers).toEqual({ Authorization: "Bearer secret" });
    expect(options.followRedirects).toBe(false);
    expect(log).toHaveBeenCalledWith(JSON.stringify(preview));
    expect(releaseLock).toHaveBeenCalled();
  });
  it("maps reordered columns by header", () => {
    const { context, raw, fetch } = setup();
    raw.forEach(row => row.reverse());
    runInNewContext("previewGuests()", context);
    expect(JSON.parse(fetch.mock.calls[0][1].payload).snapshot.values[1][0]).toBe("G001");
  });
  it("refuses a configured foreign host before sending secrets", () => {
    const { context, fetch, properties, releaseLock } = setup();
    properties.GUEST_SYNC_URL = "https://typo.invalid/api/integrations/guest-sheet";
    expect(() => runInNewContext("previewGuests()", context)).toThrow("HOST_NOT_ALLOWED");
    expect(fetch).not.toHaveBeenCalled(); expect(releaseLock).toHaveBeenCalled();
  });
  it("blocks the wrong source", () => {
    const { context, fetch } = setup();
    runInNewContext("GUEST_SOURCE.spreadsheetId = 'wrong'", context);
    expect(() => runInNewContext("previewGuests()", context)).toThrow("WRONG_SOURCE");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["missing", "duplicate", "formula"])("fails before sending for %s required data", (kind) => {
    const { context, raw, fetch } = setup();
    if (kind === "missing") raw[0][0] = "wrong";
    if (kind === "duplicate") raw[0][8] = "이름*";
    if (kind === "formula") raw[1][3] = "#REF!";
    expect(() => runInNewContext("previewGuests()", context)).toThrow(kind === "formula" ? "SOURCE_HAS_FORMULA_ERROR" : "INVALID_HEADERS");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("ignores formula errors in excluded columns and does not guess lost phone zeroes", () => {
    const { context, raw, fetch } = setup(); raw[1][8] = "#REF!"; raw[1][2] = 1012345678;
    runInNewContext("previewGuests()", context);
    expect(JSON.parse(fetch.mock.calls[0][1].payload).snapshot.values[1][2]).toBe("1012345678");
  });
  it("retries network loss and 429 with the exact same idempotent payload", () => {
    const { context, fetch } = setup();
    fetch.mockImplementationOnce(() => { throw new Error("private upstream error"); })
      .mockReturnValueOnce(response(429));
    runInNewContext("previewGuests()", context);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(new Set(fetch.mock.calls.map(call => call[1].payload)).size).toBe(1);
    expect(context.Utilities.getUuid).toHaveBeenCalledTimes(1);
    expect(context.Utilities.sleep.mock.calls).toEqual([[2000], [8000]]);
  });
  it("shows known disabled errors without retry or untrusted response fields", () => {
    const { context, fetch, log } = setup();
    fetch.mockReturnValue(response(503, { error: "GUEST_SYNC_DISABLED", private: "hidden" }));
    expect(() => runInNewContext("previewGuests()", context)).toThrow("GUEST_SYNC_HTTP_503:GUEST_SYNC_DISABLED");
    expect(fetch).toHaveBeenCalledTimes(1); expect(log).not.toHaveBeenCalled();
  });
  it("bounds transient server retries without exposing arbitrary error text", () => {
    const { context, fetch } = setup();
    fetch.mockReturnValue(response(503, { error: "PRIVATE_CUSTOMER_DATA" }));
    expect(() => runInNewContext("previewGuests()", context)).toThrow(/^GUEST_SYNC_HTTP_503$/);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each([{}, { summary: { complete: -1, incomplete: 0, skippedRows: 0 } }, null])("rejects malformed success responses", (body) => {
    const { context, fetch } = setup(); fetch.mockReturnValue(response(200, body));
    expect(() => runInNewContext("previewGuests()", context)).toThrow("INVALID_SERVER_RESPONSE");
  });
  it("accepts legacy preview responses", () => {
    const { context, fetch } = setup(); fetch.mockReturnValue(response(200, preview));
    expect(runInNewContext("previewGuests()", context)).toEqual(preview);
  });
  it("records successful writes and reports held customers without resending", () => {
    const { context, fetch, properties } = setup();
    fetch.mockReturnValue(response(200, { summary: { ...summary, held_existing: 1 } }));
    expect(() => runInNewContext("syncGuests()", context)).toThrow("SYNC_SAVED_REVIEW_REQUIRED:");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(properties.GUEST_SYNC_LAST_SUCCESS).toBeTruthy();
    expect(JSON.parse(properties.GUEST_SYNC_LAST_COUNTS).held_existing).toBe(1);
  });
});
