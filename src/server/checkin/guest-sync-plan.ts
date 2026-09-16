import "server-only";
import { previewGuestImport } from "./guest-import";

export const GUEST_SHEET = {
  spreadsheetId: "14FEUBqR5mTd0QiIyW_uYEC2lH2xwbo46D_HNBrd49To",
  sheetId: 1004515357,
  title: "게스트_마스터",
} as const;
export const GUEST_PRODUCTION_PROJECT = "rfwxpqekweizestlxomi";

export class GuestSyncError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export interface GuestSheetSnapshot {
  spreadsheetId: string;
  sheetId: number;
  title: string;
  readAt: string;
  values: unknown[][];
}

/** Include incomplete IDs in the plan so an existing customer can be put on hold.
 * The RPC never inserts a new incomplete customer. */
export function planGuestSync(snapshot: GuestSheetSnapshot) {
  if (snapshot.spreadsheetId !== GUEST_SHEET.spreadsheetId ||
      snapshot.sheetId !== GUEST_SHEET.sheetId || snapshot.title !== GUEST_SHEET.title) {
    throw new GuestSyncError("WRONG_SOURCE");
  }
  if (!Number.isFinite(Date.parse(snapshot.readAt)) || !Array.isArray(snapshot.values) ||
      snapshot.values.length > 5001 || snapshot.values.some((row) => !Array.isArray(row) || row.length > 100)) {
    throw new GuestSyncError("INVALID_SNAPSHOT");
  }
  let preview;
  try { preview = previewGuestImport(snapshot.values); }
  catch { throw new GuestSyncError("INVALID_HEADERS"); }
  if (!preview.guests.length) throw new GuestSyncError("EMPTY_SNAPSHOT");
  if (preview.problems.some((problem) => problem.field === "guestId")) {
    throw new GuestSyncError("INVALID_OR_DUPLICATE_GUEST_ID");
  }
  const headers = snapshot.values[0].map((value) => String(value ?? "").trim());
  // Reject duplicate optional headers too: source_fields must never silently lose data.
  const nonempty = headers.filter(Boolean);
  if (new Set(nonempty).size !== nonempty.length) throw new GuestSyncError("INVALID_HEADERS");
  const guests = preview.guests.map((guest) => {
    const problems = preview.problems.filter((problem) => problem.row === guest.sourceRow);
    const invalid = (field: string) => problems.some((problem) => problem.field === field);
    const sourceFields = Object.fromEntries(headers.flatMap((header, index) => header
      ? [[header, String(snapshot.values[guest.sourceRow - 1][index] ?? "").trim()]] : []));
    return {
      guest_id: guest.guestId,
      source_row: guest.sourceRow,
      display_name: guest.name || null,
      phone: invalid("phone") ? null : guest.phone,
      contract_start_date: invalid("contractStart") ? null : guest.contractStart,
      contract_end_date: invalid("contractEnd") ? null : guest.contractEnd,
      customer_status: guest.status,
      note_category: guest.noteCategory,
      note_detail: guest.noteDetail,
      source_fields: sourceFields,
      validation_errors: problems.map(({ field, code }) => ({ field, code })),
    };
  });
  return {
    guests,
    skippedRows: preview.skippedRows.length,
    complete: guests.filter((guest) => !guest.validation_errors.length).length,
    incomplete: guests.filter((guest) => guest.validation_errors.length).length,
    readAt: new Date(snapshot.readAt).toISOString(),
  };
}
