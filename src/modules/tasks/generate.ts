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

/** Expands a campaign's date range + frequency into discrete cycles (each with a due date). */
export function computeCycles(
  startStr: string,
  endStr: string,
  frequency: Frequency,
  skipWeekends: boolean,
): Cycle[] {
  const start = parse(startStr);
  const end = parse(endStr);
  if (end < start) return [];
  const cycles: Cycle[] = [];

  if (frequency === "daily") {
    let cur = start;
    while (cur <= end && cycles.length < MAX_CYCLES) {
      const dow = cur.getUTCDay();
      if (!(skipWeekends && (dow === 0 || dow === 6))) {
        const d = fmt(cur);
        cycles.push({ start: d, end: d, due: d });
      }
      cur = addDays(cur, 1);
    }
  } else if (frequency === "weekly") {
    let cur = start;
    while (cur <= end && cycles.length < MAX_CYCLES) {
      const e = addDays(cur, 6) > end ? end : addDays(cur, 6);
      cycles.push({ start: fmt(cur), end: fmt(e), due: fmt(e) });
      cur = addDays(cur, 7);
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
