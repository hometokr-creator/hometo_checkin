import "server-only";

// Input is Google Sheets FORMATTED_VALUE data. No persistence or sending here.
const columns = {
  guestId: "게스트ID*", name: "이름*", phone: "연락처",
  status: "고객상태*", noteCategory: "특이사항범주", noteDetail: "특이사항상세",
  contractStart: "실제 계약 시작일", contractEnd: "실제 계약 종료일",
} as const;
type Field = keyof typeof columns;
export interface ImportedGuest {
  sourceRow: number;
  guestId: string;
  name: string;
  phone: string | null;
  status: string | null;
  noteCategory: string | null;
  noteDetail: string | null;
  contractStart: string | null;
  contractEnd: string | null;
}
export interface ImportProblem { row: number; field: Field; code: "missing" | "invalid" | "duplicate" }
export interface GuestImportPreview {
  guests: ImportedGuest[];
  skippedRows: number[];
  problems: ImportProblem[];
}
function cell(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}
function isoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** A preview, not a list of approved recipients. Problems must be resolved before promotion. */
export function previewGuestImport(values: readonly (readonly unknown[])[]): GuestImportPreview {
  const headers = (values[0] ?? []).map(cell);
  const indexes = {} as Record<Field, number>;
  for (const [field, label] of Object.entries(columns) as [Field, string][]) {
    const index = headers.indexOf(label);
    if (index < 0 || headers.lastIndexOf(label) !== index) {
      throw new Error(`Missing or duplicate source column: ${label}`);
    }
    indexes[field] = index;
  }
  const result: GuestImportPreview = { guests: [], skippedRows: [], problems: [] };
  const ids = new Map<string, number[]>();
  values.slice(1).forEach((raw, offset) => {
    const row = offset + 2;
    if (!raw.some((value) => cell(value))) return;
    const read = (field: Field) => cell(raw[indexes[field]]);
    const problem = (field: Field, code: ImportProblem["code"]) => result.problems.push({ row, field, code });
    const guestId = read("guestId");
    // Ignore only true ID-only placeholders, never a partially entered customer.
    if (guestId && raw.every((value, index) => index === indexes.guestId || !cell(value))) {
      result.skippedRows.push(row);
      return;
    }
    if (!guestId) problem("guestId", "missing");
    else if (!/^G\d{3,}$/.test(guestId)) problem("guestId", "invalid");
    if (guestId) ids.set(guestId, [...(ids.get(guestId) ?? []), row]);
    const name = read("name");
    if (!name) problem("name", "missing");
    const rawPhone = read("phone");
    const phone = rawPhone.replace(/[\s-]/g, "");
    if (!phone) problem("phone", "missing");
    else if (!/^0\d{8,10}$/.test(phone)) problem("phone", "invalid");
    const contractStart = read("contractStart");
    const contractEnd = read("contractEnd");
    for (const field of ["contractStart", "contractEnd"] as const) {
      const date = read(field);
      if (!date) problem(field, "missing");
      else if (!isoDate(date)) problem(field, "invalid");
    }
    if (isoDate(contractStart) && isoDate(contractEnd) && contractEnd <= contractStart) problem("contractEnd", "invalid");
    result.guests.push({ sourceRow: row, guestId, name, phone: phone || null,
      status: read("status") || null, noteCategory: read("noteCategory") || null,
      noteDetail: read("noteDetail") || null, contractStart: contractStart || null, contractEnd: contractEnd || null });
  });
  for (const rows of ids.values()) {
    if (rows.length > 1) for (const row of rows) result.problems.push({ row, field: "guestId", code: "duplicate" });
  }
  return result;
}
