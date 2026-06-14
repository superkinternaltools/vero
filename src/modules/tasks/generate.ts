export type Cycle = { start: string; end: string; due: string };
export type Frequency = "daily" | "weekly" | "monthly";

function parse(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function fmt(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}
function addDays(dt: Date, n: number): Date {
  const x = new Date(dt);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

const MAX_CYCLES = 366;

// Calendar-month week bands: 1-7, 8-14, 15-21, 22-end
const WEEK_BANDS: [number, number][] = [[1, 7], [8, 14], [15, 21], [22, 31]];

/** Expands a campaign's date range + frequency into discrete cycles (each with a due date). */
export function computeCycles(
  startStr: string,
  endStr: string,
  frequency: Frequency,
  skipWeekends: boolean,
  skipDates: string[] = [],
): Cycle[] {
  const start = parse(startStr);
  const end = parse(endStr);
  if (end < start) return [];
  const cycles: Cycle[] = [];
  const skipSet = new Set(skipDates);

  if (frequency === "daily") {
    let cur = start;
    while (cur <= end && cycles.length < MAX_CYCLES) {
      const dow = cur.getUTCDay();
      const d = fmt(cur);
      if (!(skipWeekends && (dow === 0 || dow === 6)) && !skipSet.has(d)) {
        cycles.push({ start: d, end: d, due: d });
      }
      cur = addDays(cur, 1);
    }
  } else if (frequency === "weekly") {
    // Weeks are calendar-month aligned: 1–7, 8–14, 15–21, 22–end
    let yr = start.getUTCFullYear();
    let mo = start.getUTCMonth();

    outer:
    while (new Date(Date.UTC(yr, mo, 1)) <= end && cycles.length < MAX_CYCLES) {
      const eom = new Date(Date.UTC(yr, mo + 1, 0));
      for (const [ws, we] of WEEK_BANDS) {
        const wStart = new Date(Date.UTC(yr, mo, ws));
        const wEnd = new Date(Date.UTC(yr, mo, Math.min(we, eom.getUTCDate())));
        const cStart = wStart < start ? start : wStart;
        const cEnd = wEnd > end ? end : wEnd;
        if (cStart <= cEnd) {
          cycles.push({ start: fmt(cStart), end: fmt(cEnd), due: fmt(cEnd) });
          if (cycles.length >= MAX_CYCLES) break outer;
        }
      }
      if (mo === 11) { yr++; mo = 0; } else { mo++; }
    }
  } else {
    let cur = start;
    while (cur <= end && cycles.length < MAX_CYCLES) {
      const eom = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
      const e = eom > end ? end : eom;
      cycles.push({ start: fmt(cur), end: fmt(e), due: fmt(e) });
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
  }
  return cycles;
}
