import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";
import type {
  PresetRow,
  RosterRow,
  RosterGrid,
  GridCell,
  GridMember,
  ShiftWindow,
  ShiftMode,
  AttendanceLog,
  LogRow,
  DayStatus,
  WeeklyRow,
  PunchContext,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── time helpers (IST) ──────────────────────────────────────────────────────
function istHM(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}
function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── preset row parsing ──────────────────────────────────────────────────────
function parsePreset(r: any): PresetRow {
  const mode: ShiftMode = r.mode === "open" ? "open" : "fixed";
  const w = r.windows;
  return {
    id: r.id,
    name: r.name,
    mode,
    windows: mode === "fixed" && Array.isArray(w) ? (w as ShiftWindow[]) : [],
    punches: mode === "open" ? Number(w?.punches ?? 2) : (Array.isArray(w) ? w.length : 0),
    midPhotoMin: r.mid_photo_min ?? 0,
  };
}

// ── nav discovery ───────────────────────────────────────────────────────────
/** True if the user has any current-or-future roster assignment (drives the
 *  "My attendance" nav item). Reads own rows via RLS. */
export async function userHasAssignments(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("attendance_assignments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("work_date", addDaysISO(todayIST(), -1));
  return (count ?? 0) > 0;
}

// ── presets ─────────────────────────────────────────────────────────────────
export async function listPresets(): Promise<PresetRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_shift_presets")
    .select("id, name, mode, windows, mid_photo_min")
    .is("deleted_at", null)
    .order("name");
  return ((data as any[]) ?? []).map(parsePreset);
}

// ── rosters ─────────────────────────────────────────────────────────────────
export async function listRosters(): Promise<RosterRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_rosters")
    .select("id, name, start_date, end_date, overtime_cap_hours, holiday_dates, attendance_roster_members ( user_id )")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    overtimeCapHours: r.overtime_cap_hours ?? null,
    holidayDates: r.holiday_dates ?? [],
    memberCount: (r.attendance_roster_members ?? []).length,
  }));
}

async function listStoreOptions(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.from("stores").select("id, code, name").is("deleted_at", null).order("code");
  return ((data as any[]) ?? []).map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }));
}

/** Active users that can be placed on a roster. */
export async function listAssignableUsers(): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, display_name, email")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("display_name");
  return ((data as any[]) ?? []).map((p) => ({ id: p.id, name: p.display_name || p.email }));
}

export async function getRosterGrid(rosterId: string, weekStart?: string): Promise<RosterGrid | null> {
  const admin = createAdminClient();
  const { data: roster } = await admin
    .from("attendance_rosters")
    .select("id, name, start_date, end_date, overtime_cap_hours, holiday_dates")
    .eq("id", rosterId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!roster) return null;
  const r = roster as any;

  const ws = weekStart || r.start_date;
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(ws, i));

  const [{ data: members }, { data: assigns }, presets, stores] = await Promise.all([
    admin.from("attendance_roster_members").select("user_id, profiles ( display_name, email )").eq("roster_id", rosterId),
    admin
      .from("attendance_assignments")
      .select("user_id, work_date, preset_id, mode, windows, store_id, stores ( code, name ), attendance_shift_presets ( name )")
      .eq("roster_id", rosterId)
      .gte("work_date", days[0])
      .lte("work_date", days[6]),
    listPresets(),
    listStoreOptions(admin),
  ]);

  const memberRows: GridMember[] = ((members as any[]) ?? [])
    .map((m) => ({ userId: m.user_id, name: m.profiles?.display_name || m.profiles?.email || "—" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const cells: Record<string, Record<string, GridCell>> = {};
  for (const a of (assigns as any[]) ?? []) {
    const mode: ShiftMode = a.mode === "open" ? "open" : "fixed";
    const wins = Array.isArray(a.windows) ? (a.windows as ShiftWindow[]) : [];
    const label =
      a.attendance_shift_presets?.name ??
      (mode === "open" ? "Open" : wins[0] ? `${wins[0].start}–${wins[wins.length - 1].end}` : "Custom");
    cells[a.user_id] = cells[a.user_id] ?? {};
    cells[a.user_id][a.work_date] = {
      presetId: a.preset_id ?? null,
      label,
      mode,
      windows: wins,
      storeId: a.store_id,
      storeName: a.stores ? `${a.stores.code}` : "—",
    };
  }

  return {
    roster: {
      id: r.id,
      name: r.name,
      startDate: r.start_date,
      endDate: r.end_date,
      overtimeCapHours: r.overtime_cap_hours ?? null,
      holidayDates: r.holiday_dates ?? [],
      memberCount: memberRows.length,
    },
    weekStart: ws,
    days,
    members: memberRows,
    cells,
    presets,
    stores,
  };
}

// ── day-status computation ──────────────────────────────────────────────────
type DayResult = {
  status: DayStatus;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number | null;
  overtimeMinutes: number;
};

function computeDay(
  mode: ShiftMode,
  windows: ShiftWindow[],
  dayPunches: any[],
  workDate: string,
  overtimeCapHours: number | null,
): DayResult {
  const isPast = workDate < todayIST();
  const inP = dayPunches.find((p) => p.kind === "check_in") ?? dayPunches[0];
  const outP =
    dayPunches.find((p) => p.kind === "check_out") ??
    (dayPunches.length > 1 ? dayPunches[dayPunches.length - 1] : null);

  const checkIn = inP ? istHM(inP.captured_at) : null;
  const checkOut = outP && outP !== inP ? istHM(outP.captured_at) : null;

  if (!inP) {
    return { status: isPast ? "absent" : "incomplete", checkIn: null, checkOut: null, workedMinutes: null, overtimeMinutes: 0 };
  }

  const anchor = mode === "fixed" && windows[0] ? hmToMin(windows[0].start) : hmToMin(checkIn!);
  const norm = (m: number) => (m < anchor - 60 ? m + 1440 : m);

  const inMin = norm(hmToMin(checkIn!));
  const outMin = checkOut ? norm(hmToMin(checkOut)) : null;
  const worked = outMin != null ? outMin - inMin : null;

  if (mode === "open") {
    return {
      status: checkOut ? "present" : "incomplete",
      checkIn,
      checkOut,
      workedMinutes: worked,
      overtimeMinutes: 0,
    };
  }

  // fixed mode
  const first = windows[0];
  const last = windows[windows.length - 1] ?? first;
  const late = first ? inMin > norm(hmToMin(first.end)) + (first.graceMin ?? 0) : false;
  let overtimeMinutes = 0;
  let status: DayStatus = late ? "late" : "present";

  if (checkOut && last) {
    const endMin = norm(hmToMin(last.end));
    if (outMin! > endMin) {
      overtimeMinutes = outMin! - endMin;
      if (overtimeCapHours != null) overtimeMinutes = Math.min(overtimeMinutes, overtimeCapHours * 60);
      if (!late) status = "overtime";
    } else if (outMin! < endMin - 1) {
      status = "left_early";
    }
  } else if (!checkOut) {
    status = "incomplete";
    if (late) status = "late";
  }

  return { status, checkIn, checkOut, workedMinutes: worked, overtimeMinutes };
}

// ── attendance log (one day) ────────────────────────────────────────────────
export async function getAttendanceLog(dateISO: string): Promise<AttendanceLog> {
  const admin = createAdminClient();
  const [{ data: assigns }, { data: punches }] = await Promise.all([
    admin
      .from("attendance_assignments")
      .select("id, user_id, work_date, mode, windows, store_id, roster_id, stores ( code, name ), profiles ( display_name, email ), attendance_rosters ( overtime_cap_hours )")
      .eq("work_date", dateISO),
    admin
      .from("attendance_punches")
      .select("id, user_id, kind, captured_at, photo_url, geofence_flag, geofence_distance_m, no_location_flag, reviewed_at")
      .eq("work_date", dateISO)
      .order("captured_at"),
  ]);

  const userIds = [...new Set(((assigns as any[]) ?? []).map((a) => a.user_id))];
  const refMap = new Map<string, string>();
  if (userIds.length) {
    const { data: refs } = await admin
      .from("attendance_references")
      .select("user_id, photo_url")
      .in("user_id", userIds);
    for (const r of (refs as any[]) ?? []) refMap.set(r.user_id, r.photo_url);
  }

  const punchesByUser = new Map<string, any[]>();
  for (const p of (punches as any[]) ?? []) {
    const arr = punchesByUser.get(p.user_id) ?? [];
    arr.push(p);
    punchesByUser.set(p.user_id, arr);
  }

  const rows: LogRow[] = ((assigns as any[]) ?? []).map((a) => {
    const mode: ShiftMode = a.mode === "open" ? "open" : "fixed";
    const windows = Array.isArray(a.windows) ? (a.windows as ShiftWindow[]) : [];
    const dayPunches = punchesByUser.get(a.user_id) ?? [];
    const cap = a.attendance_rosters?.overtime_cap_hours ?? null;
    const d = computeDay(mode, windows, dayPunches, a.work_date, cap);
    const flags: string[] = [];
    if (dayPunches.some((p) => p.geofence_flag)) flags.push("geo");
    if (dayPunches.some((p) => p.no_location_flag)) flags.push("no_gps");
    const shiftLabel =
      mode === "open" ? "Open" : windows[0] ? `${windows[0].start}–${windows[windows.length - 1].end}` : "—";
    return {
      userId: a.user_id,
      name: a.profiles?.display_name || a.profiles?.email || "—",
      storeName: a.stores ? `${a.stores.code}` : "—",
      shiftLabel,
      mode,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      workedMinutes: d.workedMinutes,
      overtimeMinutes: d.overtimeMinutes,
      status: d.status,
      flags,
      referencePhoto: refMap.get(a.user_id) ?? null,
      punches: dayPunches.map((p) => ({
        id: p.id,
        kind: p.kind,
        capturedAt: p.captured_at,
        photoUrl: p.photo_url,
        geofenceFlag: p.geofence_flag,
        geofenceDistanceM: p.geofence_distance_m,
        noLocationFlag: p.no_location_flag,
        reviewedAt: p.reviewed_at,
      })),
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));

  return {
    date: dateISO,
    rows,
    summary: {
      expected: rows.length,
      present: rows.filter((r) => r.checkIn != null).length,
      late: rows.filter((r) => r.status === "late").length,
      absent: rows.filter((r) => r.status === "absent").length,
      flagged: rows.filter((r) => r.flags.length > 0).length,
    },
  };
}

// ── weekly analysis ─────────────────────────────────────────────────────────
export async function getWeeklyAnalysis(weekStart: string): Promise<{ rows: WeeklyRow[]; days: string[] }> {
  const admin = createAdminClient();
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));

  const [{ data: assigns }, { data: punches }] = await Promise.all([
    admin
      .from("attendance_assignments")
      .select("user_id, work_date, mode, windows, profiles ( display_name, email ), attendance_rosters ( overtime_cap_hours )")
      .gte("work_date", days[0])
      .lte("work_date", days[6]),
    admin
      .from("attendance_punches")
      .select("user_id, work_date, kind, captured_at")
      .gte("work_date", days[0])
      .lte("work_date", days[6])
      .order("captured_at"),
  ]);

  const punchKey = (uid: string, d: string) => `${uid}|${d}`;
  const punchMap = new Map<string, any[]>();
  for (const p of (punches as any[]) ?? []) {
    const k = punchKey(p.user_id, p.work_date);
    const arr = punchMap.get(k) ?? [];
    arr.push(p);
    punchMap.set(k, arr);
  }

  const byUser = new Map<string, WeeklyRow>();
  const inMinsByUser = new Map<string, number[]>();
  const outMinsByUser = new Map<string, number[]>();

  for (const a of (assigns as any[]) ?? []) {
    const uid = a.user_id;
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        userId: uid,
        name: a.profiles?.display_name || a.profiles?.email || "—",
        present: 0, expected: 0, late: 0, absent: 0,
        workedMinutes: 0, overtimeMinutes: 0,
        avgIn: null, avgOut: null,
        perDayMinutes: [0, 0, 0, 0, 0, 0, 0],
      });
      inMinsByUser.set(uid, []);
      outMinsByUser.set(uid, []);
    }
    const row = byUser.get(uid)!;
    const mode: ShiftMode = a.mode === "open" ? "open" : "fixed";
    const windows = Array.isArray(a.windows) ? (a.windows as ShiftWindow[]) : [];
    const dp = punchMap.get(punchKey(uid, a.work_date)) ?? [];
    const cap = a.attendance_rosters?.overtime_cap_hours ?? null;
    const d = computeDay(mode, windows, dp, a.work_date, cap);

    row.expected += 1;
    if (d.checkIn != null) row.present += 1;
    if (d.status === "late") row.late += 1;
    if (d.status === "absent") row.absent += 1;
    row.overtimeMinutes += d.overtimeMinutes;
    if (d.workedMinutes != null) {
      row.workedMinutes += d.workedMinutes;
      const idx = days.indexOf(a.work_date);
      if (idx >= 0) row.perDayMinutes[idx] += d.workedMinutes;
    }
    if (d.checkIn) inMinsByUser.get(uid)!.push(hmToMin(d.checkIn));
    if (d.checkOut) outMinsByUser.get(uid)!.push(hmToMin(d.checkOut));
  }

  const fmtAvg = (mins: number[]): string | null => {
    if (!mins.length) return null;
    const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
    return `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`;
  };

  const rows = [...byUser.values()].map((r) => ({
    ...r,
    avgIn: fmtAvg(inMinsByUser.get(r.userId) ?? []),
    avgOut: fmtAvg(outMinsByUser.get(r.userId) ?? []),
  }));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { rows, days };
}

// ── punch context (for the punch screen) ────────────────────────────────────
export async function getPunchContext(userId: string, dateISO?: string): Promise<PunchContext> {
  const admin = createAdminClient();
  const date = dateISO || todayIST();

  const [{ data: assign }, { data: ref }, { data: punches }] = await Promise.all([
    admin
      .from("attendance_assignments")
      .select("id, roster_id, mode, windows, store_id, stores ( code, name ), attendance_shift_presets ( mid_photo_min )")
      .eq("user_id", userId)
      .eq("work_date", date)
      .maybeSingle(),
    admin.from("attendance_references").select("user_id").eq("user_id", userId).maybeSingle(),
    admin
      .from("attendance_punches")
      .select("kind, captured_at")
      .eq("user_id", userId)
      .eq("work_date", date)
      .order("captured_at"),
  ]);

  const a = assign as any;
  return {
    date,
    hasReference: !!ref,
    assignment: a
      ? {
          assignmentId: a.id,
          rosterId: a.roster_id,
          storeId: a.store_id,
          storeName: a.stores ? `${a.stores.code} — ${a.stores.name}` : "—",
          mode: a.mode === "open" ? "open" : "fixed",
          windows: Array.isArray(a.windows) ? (a.windows as ShiftWindow[]) : [],
          midPhotoMin: a.attendance_shift_presets?.mid_photo_min ?? 0,
        }
      : null,
    punches: ((punches as any[]) ?? []).map((p) => ({ kind: p.kind, capturedAt: p.captured_at })),
  };
}
