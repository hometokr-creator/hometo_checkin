/** Paste into the Apps Script project bound to the customer spreadsheet. */
const GUEST_SOURCE = {
  spreadsheetId: '14FEUBqR5mTd0QiIyW_uYEC2lH2xwbo46D_HNBrd49To',
  sheetId: 1004515357,
  title: '게스트_마스터'
};

// Run once as the account that will own the daily trigger. Values are never logged.
function configureGuestSync() {
  const ui = SpreadsheetApp.getUi();
  const endpoint = ui.prompt('서버 주소', '운영 HTTPS 주소 + /api/integrations/guest-sheet', ui.ButtonSet.OK_CANCEL);
  if (endpoint.getSelectedButton() !== ui.Button.OK) return;
  const url = endpoint.getResponseText().trim();
  if (!/^https:\/\/[^/?#]+\/api\/integrations\/guest-sheet$/.test(url)) throw new Error('INVALID_ENDPOINT');
  const token = ui.prompt('동기화 인증값', '서버 CHECKIN_GUEST_SYNC_SECRET과 같은 값 (채팅에 공유하지 마세요)', ui.ButtonSet.OK_CANCEL);
  if (token.getSelectedButton() !== ui.Button.OK) return;
  const secret = token.getResponseText().trim();
  if (secret.length < 32) throw new Error('INVALID_SECRET');
  PropertiesService.getUserProperties().setProperties({ GUEST_SYNC_URL: url, GUEST_SYNC_SECRET: secret });
}

function previewGuests() { return sendGuests_(true); }
function syncGuests() { return sendGuests_(false); }

function sendGuests_(dryRun) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('SYNC_ALREADY_RUNNING');
  try {
    const config = PropertiesService.getUserProperties().getProperties();
    if (!config.GUEST_SYNC_URL || !config.GUEST_SYNC_SECRET) throw new Error('CONFIGURE_FIRST');
    const book = SpreadsheetApp.getActiveSpreadsheet();
    if (!book || book.getId() !== GUEST_SOURCE.spreadsheetId) throw new Error('WRONG_SOURCE');
    const sheet = book.getSheets().find(tab => tab.getSheetId() === GUEST_SOURCE.sheetId);
    if (!sheet || sheet.getName() !== GUEST_SOURCE.title) throw new Error('SOURCE_TAB_CHANGED');
    const rows = sheet.getLastRow();
    const columns = sheet.getLastColumn();
    if (rows < 2 || rows > 5001 || columns < 8 || columns > 100 || rows * columns > 100000) throw new Error('SOURCE_BOUNDS_CHANGED');
    const readAt = new Date().toISOString();
    const payload = JSON.stringify({
      runId: Utilities.getUuid(), dryRun,
      snapshot: { ...GUEST_SOURCE, readAt, values: sheet.getRange(1, 1, rows, columns).getDisplayValues() }
    });
    if (Utilities.newBlob(payload).getBytes().length > 2000000) throw new Error('PAYLOAD_TOO_LARGE');
    let response;
    try {
      response = UrlFetchApp.fetch(config.GUEST_SYNC_URL, {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + config.GUEST_SYNC_SECRET },
        payload, muteHttpExceptions: true, followRedirects: false
      });
    } catch (_) { throw new Error('GUEST_SYNC_NETWORK_FAILED'); }
    if (response.getResponseCode() !== 200) throw new Error('GUEST_SYNC_HTTP_' + response.getResponseCode());
    let result;
    try { result = JSON.parse(response.getContentText()); }
    catch (_) { throw new Error('INVALID_SERVER_RESPONSE'); }
    // Never print request rows, credentials, or an unfiltered server response.
    const counts = dryRun ? result : result.summary;
    const safe = {};
    ['complete', 'incomplete', 'skippedRows', 'inserted', 'updated', 'unchanged', 'excluded_incomplete', 'held_existing', 'missing_existing'].forEach(key => {
      if (typeof counts?.[key] === 'number') safe[key] = counts[key];
    });
    console.log(JSON.stringify(safe));
    return safe;
  } finally { lock.releaseLock(); }
}

// Install only after previewGuests and syncGuests both succeed.
function installDailyGuestSync() {
  previewGuests();
  removeDailyGuestSync();
  ScriptApp.newTrigger('syncGuests').timeBased().atHour(6).everyDays(1).inTimezone('Asia/Seoul').create();
}

function removeDailyGuestSync() {
  ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'syncGuests')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}
