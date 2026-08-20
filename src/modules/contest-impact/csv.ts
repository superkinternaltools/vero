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

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Accepts "2026-07", "2026-07-13", "July 2026", "13 Jul, 2026" — and a bare
 * month name like "July", which the sheets use.
 *
 * A bare name carries no year, so `fallbackYear` supplies it (the import
 * screen asks for it once per upload). The bare-name check runs BEFORE the
 * `new Date(...)` fallback deliberately: engines disagree on what
 * `new Date("July")` means — some reject it, some quietly resolve it against
 * the current year — and silently filing a sheet under the wrong year is far
 * worse than refusing to guess. */
export function parseMonth(cell: string, fallbackYear?: number): string | null {
  const c = cell.trim();
  if (/^\d{4}-\d{2}$/.test(c)) return c;
  if (/^\d{4}-\d{2}-\d{2}$/.test(c)) return c.slice(0, 7);

  const bare = MONTH_NAMES[c.toLowerCase()];
  if (bare) return fallbackYear ? `${fallbackYear}-${String(bare).padStart(2, "0")}` : null;

  const d = new Date(c);
  if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return null;
}
