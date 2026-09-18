import "server-only";
import { JWT } from "google-auth-library";
import { databaseEnvironment } from "../env";
import { GUEST_PRODUCTION_PROJECT, GUEST_SHEET, GuestSyncError, type GuestSheetSnapshot } from "./guest-sync-plan";

export function assertLiveGuestSyncTarget() {
  const { url } = databaseEnvironment();
  if (url !== `https://${GUEST_PRODUCTION_PROJECT}.supabase.co`) {
    throw new GuestSyncError("LIVE_SOURCE_REQUIRES_PRODUCTION_DATABASE");
  }
}

export async function readGuestSheet(): Promise<GuestSheetSnapshot> {
  // Real customer data must not enter the shared test project.
  assertLiveGuestSyncTarget();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new GuestSyncError("GOOGLE_CREDENTIALS_MISSING");
  const auth = new JWT({ email, key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    transporterOptions: { timeout: 15_000, retry: false },
  });
  const readAt = new Date().toISOString();
  try {
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${GUEST_SHEET.spreadsheetId}`;
    const metadata = await auth.request<{ sheets: { properties: {
      sheetId: number; title: string; gridProperties: { rowCount: number; columnCount: number };
    } }[] }>({ url: base, params: { fields: "sheets(properties(sheetId,title,gridProperties))" }, timeout: 15_000, retry: false });
    const sheet = metadata.data.sheets.find(({ properties }) => properties.sheetId === GUEST_SHEET.sheetId)?.properties;
    if (!sheet || sheet.title !== GUEST_SHEET.title) throw new GuestSyncError("SOURCE_TAB_CHANGED");
    const { rowCount, columnCount } = sheet.gridProperties;
    if (rowCount < 2 || rowCount > 5001 || columnCount < 8 || columnCount > 100 || rowCount * columnCount > 100_000) {
      throw new GuestSyncError("SOURCE_BOUNDS_CHANGED");
    }
    let column = "";
    for (let remaining = columnCount; remaining > 0; remaining = Math.floor((remaining - 1) / 26)) {
      column = String.fromCharCode(65 + (remaining - 1) % 26) + column;
    }
    const range = `'${GUEST_SHEET.title}'!A1:${column}${rowCount}`;
    const result = await auth.request<{ values?: unknown[][] }>({
      url: `${base}/values/${encodeURIComponent(range)}`,
      params: { valueRenderOption: "FORMATTED_VALUE" }, timeout: 15_000, retry: false,
    });
    return { ...GUEST_SHEET, readAt, values: result.data.values ?? [] };
  } catch (error) {
    if (error instanceof GuestSyncError) throw error;
    // Google error objects can contain request headers/private keys. Never propagate them.
    throw new GuestSyncError("GOOGLE_SHEETS_READ_FAILED");
  }
}
