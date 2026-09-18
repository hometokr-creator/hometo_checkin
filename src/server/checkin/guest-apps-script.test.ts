import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../../scripts/google-apps-script/guest-sync.gs", import.meta.url), "utf8");
function setup(wrongSource = false, status = 200) {
  const fetch = vi.fn(() => ({ getResponseCode: () => status, getContentText: () => JSON.stringify({ complete: 5, private: "hidden" }) }));
  const releaseLock = vi.fn();
  const log = vi.fn();
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getId: () => wrongSource ? "wrong" : "14FEUBqR5mTd0QiIyW_uYEC2lH2xwbo46D_HNBrd49To",
      getSheets: () => [{ getSheetId: () => 1004515357, getName: () => "게스트_마스터",
        getLastRow: () => 2, getLastColumn: () => 25,
        getRange: () => ({ getDisplayValues: () => [["header"], ["private customer"]] }) }]
    }) },
    PropertiesService: { getUserProperties: () => ({ getProperties: () => ({ GUEST_SYNC_URL: "https://example.invalid/api/integrations/guest-sheet", GUEST_SYNC_SECRET: "secret" }) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock }) },
    Utilities: { getUuid: () => "00000000-0000-4000-8000-000000000001", newBlob: (value: string) => ({ getBytes: () => Buffer.from(value) }) },
    UrlFetchApp: { fetch }, console: { log }
  };
  runInNewContext(source, context);
  return { context, fetch, releaseLock, log };
}
describe("Apps Script sender", () => {
  it("sends display values with auth, preview mode, and no redirects; logs only counts", () => {
    const { context, fetch, log, releaseLock } = setup();
    runInNewContext("previewGuests()", context);
    const options = fetch.mock.calls[0] as unknown as [string, { payload: string; headers: object; followRedirects: boolean }];
    expect(JSON.parse(options[1].payload).dryRun).toBe(true);
    expect(options[1].headers).toEqual({ Authorization: "Bearer secret" });
    expect(options[1].followRedirects).toBe(false);
    expect(log).toHaveBeenCalledWith('{"complete":5}');
    expect(releaseLock).toHaveBeenCalled();
  });
  it("blocks the wrong sheet before transmission", () => {
    const { context, fetch, releaseLock } = setup(true);
    expect(() => runInNewContext("syncGuests()", context)).toThrow("WRONG_SOURCE");
    expect(fetch).not.toHaveBeenCalled(); expect(releaseLock).toHaveBeenCalled();
  });
  it("reports HTTP failures without printing response contents", () => {
    const { context, log, releaseLock } = setup(false, 503);
    expect(() => runInNewContext("syncGuests()", context)).toThrow("GUEST_SYNC_HTTP_503");
    expect(log).not.toHaveBeenCalled(); expect(releaseLock).toHaveBeenCalled();
  });
});
