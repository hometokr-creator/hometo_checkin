/** Paste into the Apps Script project bound to the customer spreadsheet. */
const GUEST_SOURCE = {
  spreadsheetId: '14FEUBqR5mTd0QiIyW_uYEC2lH2xwbo46D_HNBrd49To',
  sheetId: 1004515357,
  title: '게스트_마스터'
};
const GUEST_ENDPOINT = 'https://hometogether-checkin-web.vercel.app/api/integrations/guest-sheet';
const GUEST_HEADERS = ['게스트ID*', '이름*', '연락처', '성별', '학교또는직장명', '고객상태*', '실제 계약 시작일', '실제 계약 종료일'];

// If this project already has onOpen(), call addGuestSyncMenu() from that function.
function addGuestSyncMenu() {
  SpreadsheetApp.getUi().createMenu('고객 동기화')
    .addItem('연결 설정', 'configureGuestSync')
    .addItem('저장 없이 확인', 'previewGuests')
    .addItem('지금 동기화', 'syncGuests').addToUi();
}

// Run once as the account that will own the daily trigger. Values are never logged.
function configureGuestSync() {
  const ui = SpreadsheetApp.getUi();
  const token = ui.prompt('동기화 인증값', '서버 CHECKIN_GUEST_SYNC_SECRET과 같은 값 (채팅에 공유하지 마세요)', ui.ButtonSet.OK_CANCEL);
  if (token.getSelectedButton() !== ui.Button.OK) return;
  const secret = token.getResponseText().trim();
  if (secret.length < 32) throw new Error('INVALID_SECRET');
  PropertiesService.getUserProperties().setProperties({ GUEST_SYNC_URL: GUEST_ENDPOINT, GUEST_SYNC_SECRET: secret });
}

function clearGuestSyncConfig() {
  removeDailyGuestSync();
  const properties = PropertiesService.getUserProperties();
  ['GUEST_SYNC_URL', 'GUEST_SYNC_SECRET', 'GUEST_SYNC_LAST_SUCCESS', 'GUEST_SYNC_LAST_COUNTS'].forEach(key => properties.deleteProperty(key));
}

function guestValues_(sheet, rows, columns, timezone) {
  // A single read avoids pairing formatted and raw values from different edits.
  const raw = sheet.getRange(1, 1, rows, columns).getValues();
  const header = raw[0].map(value => String(value).trim());
  const indexes = GUEST_HEADERS.map(name => {
    const index = header.indexOf(name);
    if (index < 0 || header.lastIndexOf(name) !== index) throw new Error('INVALID_HEADERS');
    return index;
  });
  return [GUEST_HEADERS.slice(), ...raw.slice(1).map(row => indexes.map((index, field) => {
    const value = row[index];
    if (value === '' || value === null || value === undefined) return '';
    if (field >= 6 && Object.prototype.toString.call(value) === '[object Date]') {
      if (!Number.isFinite(value.getTime())) throw new Error('INVALID_DATE_CELL');
      return Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
    }
    const text = String(value).trim();
    // No speculative repair of lost leading zeroes or ambiguous date strings.
    if (/^#(?:N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|ERROR!|SPILL!|CALC!)/.test(text)) throw new Error('SOURCE_HAS_FORMULA_ERROR');
    return text;
  }))];
}

function guestServerError_(response) {
  // Explicit allowlist: do not log arbitrary upstream text or echoed customer data.
  const allowed = ['UNAUTHORIZED', 'GUEST_SYNC_DISABLED', 'JSON_REQUIRED', 'INVALID_REQUEST',
    'INVALID_JSON', 'PAYLOAD_TOO_LARGE', 'STALE_SNAPSHOT', 'WRONG_SOURCE', 'INVALID_SNAPSHOT',
    'INVALID_HEADERS', 'EMPTY_SNAPSHOT', 'INVALID_OR_DUPLICATE_GUEST_ID',
    'LIVE_SOURCE_REQUIRES_PRODUCTION_DATABASE', 'GUEST_DATABASE_SYNC_FAILED', 'GUEST_SYNC_FAILED'];
  try {
    const code = JSON.parse(response.getContentText()).error;
    return allowed.includes(code) ? code : '';
  } catch (_) { return ''; }
}

function fetchGuests_(options) {
  // Reuse the exact payload/runId/readAt for all attempts, including lost responses.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) Utilities.sleep(attempt === 1 ? 2000 : 8000);
    let response;
    try { response = UrlFetchApp.fetch(GUEST_ENDPOINT, options); }
    catch (_) {
      if (attempt === 2) throw new Error('GUEST_SYNC_NETWORK_FAILED');
      continue;
    }
    const status = response.getResponseCode();
    if (status === 200) return response;
    const code = guestServerError_(response);
    const retryable = status === 429 || (status >= 500 && status <= 599 &&
      (!code || ['GUEST_DATABASE_SYNC_FAILED', 'GUEST_SYNC_FAILED'].includes(code)));
    if (!retryable || attempt === 2) throw new Error('GUEST_SYNC_HTTP_' + status + (code ? ':' + code : ''));
  }
}

function previewGuests() { return sendGuests_(true); }
function syncGuests() { return sendGuests_(false); }

function sendGuests_(dryRun) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('SYNC_ALREADY_RUNNING');
  try {
    const config = PropertiesService.getUserProperties().getProperties();
    if (!config.GUEST_SYNC_URL || !config.GUEST_SYNC_SECRET) throw new Error('CONFIGURE_FIRST');
    if (config.GUEST_SYNC_URL !== GUEST_ENDPOINT) throw new Error('HOST_NOT_ALLOWED');
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
      snapshot: { ...GUEST_SOURCE, readAt, values: guestValues_(sheet, rows, columns, book.getSpreadsheetTimeZone()) }
    });
    if (Utilities.newBlob(payload).getBytes().length > 2000000) throw new Error('PAYLOAD_TOO_LARGE');
    const response = fetchGuests_({
        method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + config.GUEST_SYNC_SECRET },
        payload, muteHttpExceptions: true, followRedirects: false
    });
    let result;
    try { result = JSON.parse(response.getContentText()); }
    catch (_) { throw new Error('INVALID_SERVER_RESPONSE'); }
    // Never print request rows, credentials, or an unfiltered server response.
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('INVALID_SERVER_RESPONSE');
    const counts = result.summary || (dryRun ? result : null);
    const required = dryRun ? ['complete', 'incomplete', 'skippedRows'] :
      ['seen', 'inserted', 'updated', 'unchanged', 'excluded_incomplete', 'held_existing', 'missing_existing', 'skipped_placeholders'];
    if (!counts || required.some(key => !Number.isInteger(counts[key]) || counts[key] < 0)) throw new Error('INVALID_SERVER_RESPONSE');
    const safe = {};
    required.forEach(key => {
      if (typeof counts?.[key] === 'number') safe[key] = counts[key];
    });
    console.log(JSON.stringify(safe));
    if (!dryRun) {
      PropertiesService.getUserProperties().setProperties({
        GUEST_SYNC_LAST_SUCCESS: new Date().toISOString(), GUEST_SYNC_LAST_COUNTS: JSON.stringify(safe)
      });
      // Writes already committed: surface a review signal without retrying the import.
      if (safe.held_existing > 0 || safe.missing_existing > 0) throw new Error('SYNC_SAVED_REVIEW_REQUIRED:' + JSON.stringify(safe));
    }
    return safe;
  } finally { lock.releaseLock(); }
}

// Install only after previewGuests and syncGuests both succeed.
function installDailyGuestSync() {
  if (!PropertiesService.getUserProperties().getProperties().GUEST_SYNC_LAST_SUCCESS) throw new Error('SYNC_ONCE_BEFORE_INSTALL');
  previewGuests();
  removeDailyGuestSync();
  ScriptApp.newTrigger('syncGuests').timeBased().atHour(6).everyDays(1).inTimezone('Asia/Seoul').create();
}

function removeDailyGuestSync() {
  ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'syncGuests')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}
