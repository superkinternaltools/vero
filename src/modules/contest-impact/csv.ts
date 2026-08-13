/** Minimal CSV parser — respects quoted fields so thousand-separated numbers
 * ("2,509.45") don't get split on their internal comma. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseNumber(cell: string): number | null {
  const cleaned = cell.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseMonth(cell: string): string | null {
  const c = cell.trim();
  if (/^\d{4}-\d{2}$/.test(c)) return c;
  if (/^\d{4}-\d{2}-\d{2}$/.test(c)) return c.slice(0, 7);
  const d = new Date(c);
  if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return null;
}

/** Strict ISO (YYYY-MM-DD) only.
 *
 * This deliberately rejects 12/08/2026. Numeric slash formats are ambiguous
 * between day-first and month-first, and a silent misread would file every
 * figure under the wrong day while nothing looked broken — which then
 * corrupts rate of sale, days of cover and every dated comparison downstream.
 * Failing loudly is the only safe option. The generated templates emit ISO,
 * so in practice this costs nothing; if a sheet comes back reformatted, the
 * import says so and names the offending rows. */
export function parseDate(cell: string): string | null {
  const c = cell.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c)) return null;
  const [y, m, d] = c.split("-").map(Number);
  // Rejects impossible dates that still match the pattern, e.g. 2026-02-31.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return c;
}

/** "2026-08-12" → "2026-08-01" — the month bucket a daily row belongs to.
 * `month` is NOT NULL on all three contest tables, so every daily insert
 * still has to supply it. */
export function monthStartOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}
