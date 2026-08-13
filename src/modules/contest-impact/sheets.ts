import { JWT } from "google-auth-library";
import { normalizeHeader } from "./csv";

// Read-only Google Sheets access for the contest-impact sync. Kept as a thin
// wrapper around google-auth-library rather than hand-rolled JWT signing —
// this can't be exercised end-to-end until a real service account and Sheet
// exist (Leg 1, external to Vero), so it uses the library Google maintains
// for exactly this flow instead of an unverifiable custom implementation.

export type ServiceAccountError = { error: string };

type ServiceAccountKey = { client_email: string; private_key: string };

/** Parses GOOGLE_SHEETS_SERVICE_ACCOUNT (the service account's JSON key,
 * as one env var) — returns a clear, specific error for each way this can
 * be missing or malformed, since this literally cannot be tested until
 * that credential exists and the failure mode needs to be legible to
 * whoever sets it up, not just "undefined is not valid JSON". */
function loadServiceAccount(): ServiceAccountKey | ServiceAccountError {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT;
  if (!raw) return { error: "GOOGLE_SHEETS_SERVICE_ACCOUNT isn't set — Google Sheets sync isn't configured yet." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "GOOGLE_SHEETS_SERVICE_ACCOUNT isn't valid JSON. It should be the full service account key file contents." };
  }
  const key = parsed as Partial<ServiceAccountKey>;
  if (!key.client_email || !key.private_key) {
    return { error: "GOOGLE_SHEETS_SERVICE_ACCOUNT is missing client_email or private_key." };
  }
  return { client_email: key.client_email, private_key: key.private_key };
}

let cachedClient: JWT | null = null;

async function getAuthorizedClient(): Promise<JWT | ServiceAccountError> {
  const account = loadServiceAccount();
  if ("error" in account) return account;
  if (!cachedClient) {
    cachedClient = new JWT({
      email: account.client_email,
      key: account.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }
  return cachedClient;
}

/** Fetches one tab's values as a raw table — the same string[][] shape
 * parseCsv() produces for a pasted sheet, so downstream row-mapping code in
 * ../rows never needs to know which source it came from. */
export async function fetchSheetTable(
  spreadsheetId: string,
  sheetName: string,
): Promise<{ table: string[][] } | ServiceAccountError> {
  const client = await getAuthorizedClient();
  if ("error" in client) return client;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}?valueRenderOption=UNFORMATTED_VALUE`;

  type SheetValuesResponse = { data: { values?: unknown[][] } };
  let res: SheetValuesResponse;
  try {
    res = await client.request<{ values?: unknown[][] }>({ url });
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 403) {
      const account = loadServiceAccount();
      const email = "error" in account ? "the service account" : account.client_email;
      return { error: `Access denied. Share the spreadsheet with ${email} (Viewer is enough).` };
    }
    if (status === 404) return { error: "Spreadsheet not found — check the Spreadsheet ID." };
    return { error: `Could not reach Google Sheets: ${err instanceof Error ? err.message : String(err)}` };
  }

  const values = res.data.values ?? [];
  if (!values.length) return { error: `The "${sheetName}" tab is empty.` };

  // Sheets omits trailing blank cells per row rather than padding them, so
  // rows can arrive shorter than the header. Every downstream mapper reads
  // columns by header-matched index, so a short row must be padded here —
  // otherwise a row that happens to have its rightmost values blank would
  // silently shift into missing-column territory instead of reading as "".
  const width = Math.max(...values.map((r) => r.length));
  const table = values.map((r) => {
    const row = r.map((cell) => (cell == null ? "" : String(cell)));
    while (row.length < width) row.push("");
    return row;
  });

  fixSerialDates(table);
  return { table };
}

/** If whoever fills the sheet types "2026-08-12" into the date column,
 * Sheets is likely to auto-convert that into a real date cell rather than
 * keep it as text — spreadsheets do this by default unless the column is
 * explicitly formatted as Plain Text. UNFORMATTED_VALUE then returns a
 * serial number (days since 1899-12-30) instead of the ISO string every
 * mapper in ../rows expects, and parseDate() would reject it outright —
 * not the day/month ambiguity that function already guards against, a
 * completely different value shape it was never meant to parse.
 *
 * Scoped to whichever column is literally named "date" (every one of the
 * three templates uses that exact header) and only touches cells that are
 * purely numeric — a real ISO string always contains hyphens, so this can't
 * misfire on a column that's genuinely already text. */
function fixSerialDates(table: string[][]): void {
  if (!table.length) return;
  const dateCol = table[0].findIndex((h) => normalizeHeader(h) === "date");
  if (dateCol === -1) return;
  const serialPattern = /^\d+(\.\d+)?$/;
  for (let i = 1; i < table.length; i++) {
    const cell = table[i][dateCol];
    if (!serialPattern.test(cell)) continue;
    const serial = Number(cell);
    const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
    table[i][dateCol] = new Date(ms).toISOString().slice(0, 10);
  }
}
