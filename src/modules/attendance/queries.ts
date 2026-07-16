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
  PunchAssignment,
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

// ── viewer scoping (store + department, same convention as Dashboard/Summary) ──
type ViewerScope = { storeIds: Set<string>; deptIds: Set<string> };

async function getViewerScope(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ViewerScope> {
  const [{ data: us }, { data: ud }] = await Promise.all([
    supabase.from("user_stores").select("store_id").eq("user_id", userId),
    supabase.from("user_departments").select("department_id").eq("user_id", userId),
  ]);
  return {
    storeIds: new Set(((us as any[]) ?? []).map((r) => r.store_id as string)),
    deptIds: new Set(((ud as any[]) ?? []).map((r) => r.department_id as string)),
  };
}

/** Departments for a set of users, as user_id -> Set(department_id). */
async function getUserDeptMap(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!userIds.length) return map;
  const { data } = await admin
    .from("user_departments")
    .select("user_id, department_id")
    .in("user_id", userIds);
  for (const row of (data as any[]) ?? []) {
    const s = map.get(row.user_id) ?? new Set<string>();
    s.add(row.department_id);
    map.set(row.user_id, s);
  }
  return map;
}

/** A person with no department tagged at all is visible to everyone (same
 * convention as untagged campaigns) — otherwise the viewer needs to share at
 * least one department with them. */
function deptMatches(personDepts: Set<string> | undefined, viewerDeptIds: Set<string>): boolean {
  if (!personDepts || personDepts.size === 0) return true;
  for (const d of personDepts) if (viewerDeptIds.has(d)) return true;
  return false;
}

/** Roles for a set of users, as user_id -> Set(role_id). */
async function getUserRoleMap(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!userIds.length) return map;
  const { data } = await admin.from("user_roles").select("user_id, role_id").in("user_id", userIds);
  for (const row of (data as any[]) ?? []) {
    const s = map.get(row.user_id) ?? new Set<string>();
    s.add(row.role_id);
    map.set(row.user_id, s);
  }
  return map;
}

// ── photo access (private bucket — signed URLs, never a stored public URL) ──
async function signPaths(
  admin: ReturnType<typeof createAdminClient>,
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (!unique.length) return map;
  const results = await Promise.all(
    unique.map((p) => admin.storage.from("attendance").createSignedUrl(p, 3600)),
  );
  unique.forEach((p, i) => {
    const url = results[i].data?.signedUrl;
    if (url) map.set(p, url);
  });
  return map;
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

/** Roster IDs visible to a non-admin: rosters with at least one assignment
 * in one of the viewer's own stores, for a person who shares one of the
 * viewer's departments (or has none tagged). */
async function getAllowedRosterIds(
  admin: ReturnType<typeof createAdminClient>,
  viewerScope: ViewerScope,
): Promise<Set<string>> {
  if (viewerScope.storeIds.size === 0) return new Set();
  const { data: assigns } = await admin
    .from("attendance_assignments")
    .select("roster_id, user_id")
    .in("store_id", [...viewerScope.storeIds]);
  const rows = (assigns as any[]) ?? [];
  if (!rows.length) return new Set();
  const userIds = [...new Set(rows.map((a) => a.user_id as string))];
  const deptMap = await getUserDeptMap(admin, userIds);
  return new Set(
    rows
      .filter((a) => deptMatches(deptMap.get(a.user_id), viewerScope.deptIds))
      .map((a) => a.roster_id as string),
  );
}

// ── rosters ─────────────────────────────────────────────────────────────────
export async function listRosters(scope: { userId: string; isAdmin: boolean }): Promise<RosterRow[]> {
  const supabase = await createClient();

  let allowedRosterIds: Set<string> | null = null;
  if (!scope.isAdmin) {
    const admin = createAdminClient();
    const viewerScope = await getViewerScope(supabase, scope.userId);
    allowedRosterIds = await getAllowedRosterIds(admin, viewerScope);
    if (allowedRosterIds.size === 0) return [];
  }

  const { data } = await supabase
    .from("attendance_rosters")
    .select("id, name, start_date, end_date, overtime_cap_hours, holiday_dates, attendance_roster_members ( user_id )")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  let list = ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    overtimeCapHours: r.overtime_cap_hours ?? null,
    holidayDates: r.holiday_dates ?? [],
    memberCount: (r.attendance_roster_members ?? []).length,
  }));
  if (allowedRosterIds) list = list.filter((r) => allowedRosterIds!.has(r.id));
  return list;
}

async function listStoreOptions(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.from("stores").select("id, code, name").is("deleted_at", null).order("code");
  return ((data as any[]) ?? []).map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }));
}

/** Stores for pickers outside the roster grid (e.g. the New roster modal's
 * default-schedule store, before any roster/grid exists yet). */
export async function listAllStores(): Promise<{ id: string; label: string }[]> {
  return listStoreOptions(createAdminClient());
}

/** Active users that can be placed on a roster. */
export type AssignableUser = {
  id: string;
  name: string;
  roleIds: string[];
  departmentIds: string[];
  storeIds: string[];
};

export async function listAssignableUsers(): Promise<AssignableUser[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select(
      `
      id, display_name, email,
      user_roles ( role_id ),
      user_departments ( department_id ),
      user_stores ( store_id )
      `,
    )
    .eq("status", "active")
    .is("deleted_at", null)
    .order("display_name");
  return ((data as any[]) ?? []).map((p) => ({
    id: p.id,
    name: p.display_name || p.email,
    roleIds: (p.user_roles ?? []).map((r: any) => r.role_id),
    departmentIds: (p.user_departments ?? []).map((d: any) => d.department_id),
    storeIds: (p.user_stores ?? []).map((s: any) => s.store_id),
  }));
}

/** Role and department options for the people-filter pickers (roster
 * creation, Log filters). */
export async function listRoleAndDeptOptions(): Promise<{
  roles: { id: string; label: string }[];
  departments: { id: string; label: string }[];
}> {
  const admin = createAdminClient();
  const [{ data: roles }, { data: depts }] = await Promise.all([
    admin.from("roles").select("id, name").order("name"),
    admin.from("departments").select("id, name").order("name"),
  ]);
  return {
    roles: ((roles as any[]) ?? []).map((r) => ({ id: r.id, label: r.name })),
    departments: ((depts as any[]) ?? []).map((d) => ({ id: d.id, label: d.name })),
  };
}

export async function getRosterGrid(
  rosterId: string,
  weekStart: string | undefined,
  scope: { userId: string; isAdmin: boolean },
): Promise<RosterGrid | null> {
  const admin = createAdminClient();

  if (!scope.isAdmin) {
    const supabase = await createClient();
    const viewerScope = await getViewerScope(supabase, scope.userId);
    const allowed = await getAllowedRosterIds(admin, viewerScope);
    if (!allowed.has(rosterId)) return null;
  }

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
      .select("id, user_id, work_date, preset_id, mode, windows, store_id, stores ( code, name ), attendance_shift_presets ( name )")
      .eq("roster_id", rosterId)
      .gte("work_date", days[0])
      .lte("work_date", days[6])
      .order("created_at"),
    listPresets(),
    listStoreOptions(admin),
  ]);

  const memberRows: GridMember[] = ((members as any[]) ?? [])
    .map((m) => ({ userId: m.user_id, name: m.profiles?.display_name || m.profiles?.email || "—" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // A day can hold more than one shift (different stores), so each cell is
  // a list rather than a single value.
  const cells: Record<string, Record<string, GridCell[]>> = {};
  for (const a of (assigns as any[]) ?? []) {
    const mode: ShiftMode = a.mode === "open" ? "open" : "fixed";
    const wins = Array.isArray(a.windows) ? (a.windows as ShiftWindow[]) : [];
    const label =
      a.attendance_shift_presets?.name ??
      (mode === "open" ? "Open" : wins[0] ? `${wins[0].start}–${wins[wins.length - 1].end}` : "Custom");
    cells[a.user_id] = cells[a.user_id] ?? {};
    const list = cells[a.user_id][a.work_date] ?? [];
    list.push({
      assignmentId: a.id,
      presetId: a.preset_id ?? null,
      label,
      mode,
      windows: wins,
      storeId: a.store_id,
      storeName: a.stores ? `${a.stores.code}` : "—",
    });
    cells[a.user_id][a.work_date] = list;
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
export async function getAttendanceLog(
  dateISO: string,
  scope: { userId: string; isAdmin: boolean },
): Promise<AttendanceLog> {
  const admin = createAdminClient();
  const emptyLog: AttendanceLog = {
    date: dateISO,
    rows: [],
    summary: { expected: 0, present: 0, late: 0, absent: 0, flagged: 0 },
  };

  let viewerScope: ViewerScope | null = null;
  if (!scope.isAdmin) {
    const supabase = await createClient();
    viewerScope = await getViewerScope(supabase, scope.userId);
    if (viewerScope.storeIds.size === 0) return emptyLog;
  }

  const [{ data: assigns }, { data: punches }] = await Promise.all([
    admin
      .from("attendance_assignments")
      .select("id, user_id, work_date, mode, windows, store_id, roster_id, stores ( code, name ), profiles ( display_name, email ), attendance_rosters ( overtime_cap_hours )")
      .eq("work_date", dateISO),
    admin
      .from("attendance_punches")
      .select("id, user_id, assignment_id, kind, captured_at, photo_path, geofence_flag, geofence_distance_m, no_location_flag, reviewed_at")
      .eq("work_date", dateISO)
      .order("captured_at"),
  ]);

  let scopedAssigns = (assigns as any[]) ?? [];
  if (viewerScope) {
    scopedAssigns = scopedAssigns.filter((a) => viewerScope!.storeIds.has(a.store_id));
    const uids = [...new Set(scopedAssigns.map((a) => a.user_id as string))];
    const deptMap = await getUserDeptMap(admin, uids);
    scopedAssigns = scopedAssigns.filter((a) => deptMatches(deptMap.get(a.user_id), viewerScope!.deptIds));
  }

  const userIds = [...new Set(scopedAssigns.map((a) => a.user_id))];
  const refPathMap = new Map<string, string>();
  if (userIds.length) {
    const { data: refs } = await admin
      .from("attendance_references")
      .select("user_id, photo_path")
      .in("user_id", userIds);
    for (const r of (refs as any[]) ?? []) refPathMap.set(r.user_id, r.photo_path);
  }

  // Keyed by assignment, not user — a person can have more than one store
  // visit (assignment) the same day, each with its own punches.
  const punchesByAssignment = new Map<string, any[]>();
  for (const p of (punches as any[]) ?? []) {
    if (!p.assignment_id) continue;
    const arr = punchesByAssignment.get(p.assignment_id) ?? [];
    arr.push(p);
    punchesByAssignment.set(p.assignment_id, arr);
  }

  const signedUrls = await signPaths(admin, [
    ...refPathMap.values(),
    ...((punches as any[]) ?? []).map((p) => p.photo_path),
  ]);

  const [personRoleMap, personDeptMap] = await Promise.all([
    getUserRoleMap(admin, userIds),
    getUserDeptMap(admin, userIds),
  ]);

  const rows: LogRow[] = scopedAssigns.map((a) => {
    const mode: ShiftMode = a.mode === "open" ? "open" : "fixed";
    const windows = Array.isArray(a.windows) ? (a.windows as ShiftWindow[]) : [];
    const dayPunches = punchesByAssignment.get(a.id) ?? [];
    const cap = a.attendance_rosters?.overtime_cap_hours ?? null;
    const d = computeDay(mode, windows, dayPunches, a.work_date, cap);
    const flags: string[] = [];
    if (dayPunches.some((p) => p.geofence_flag)) flags.push("geo");
    if (dayPunches.some((p) => p.no_location_flag)) flags.push("no_gps");
    const shiftLabel =
      mode === "open" ? "Open" : windows[0] ? `${windows[0].start}–${windows[windows.length - 1].end}` : "—";
    return {
      assignmentId: a.id,
      userId: a.user_id,
      name: a.profiles?.display_name || a.profiles?.email || "—",
      storeId: a.store_id,
      storeName: a.stores ? `${a.stores.code}` : "—",
      roleIds: [...(personRoleMap.get(a.user_id) ?? [])],
      departmentIds: [...(personDeptMap.get(a.user_id) ?? [])],
      shiftLabel,
      mode,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      workedMinutes: d.workedMinutes,
      overtimeMinutes: d.overtimeMinutes,
      status: d.status,
      flags,
      referencePhoto: (() => {
        const p = refPathMap.get(a.user_id);
        return p ? signedUrls.get(p) ?? null : null;
      })(),
      punches: dayPunches.map((p) => ({
        id: p.id,
        kind: p.kind,
        capturedAt: p.captured_at,
        photoUrl: signedUrls.get(p.photo_path) ?? null,
        geofenceFlag: p.geofence_flag,
        geofenceDistanceM: p.geofence_distance_m,
        noLocationFlag: p.no_location_flag,
        reviewedAt: p.reviewed_at,
      })),
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name) || a.storeName.localeCompare(b.storeName));

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
export async function getWeeklyAnalysis(
  weekStart: string,
  scope: { userId: string; isAdmin: boolean },
): Promise<{ rows: WeeklyRow[]; days: string[] }> {
  const admin = createAdminClient();
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));

  let viewerScope: ViewerScope | null = null;
  if (!scope.isAdmin) {
    const supabase = await createClient();
    viewerScope = await getViewerScope(supabase, scope.userId);
    if (viewerScope.storeIds.size === 0) return { rows: [], days };
  }

  const [{ data: assigns }, { data: punches }] = await Promise.all([
    admin
      .from("attendance_assignments")
      .select("id, user_id, work_date, mode, windows, store_id, profiles ( display_name, email ), attendance_rosters ( overtime_cap_hours )")
      .gte("work_date", days[0])
      .lte("work_date", days[6]),
    admin
      .from("attendance_punches")
      .select("assignment_id, kind, captured_at")
      .gte("work_date", days[0])
      .lte("work_date", days[6])
      .order("captured_at"),
  ]);

  let scopedAssigns = (assigns as any[]) ?? [];
  if (viewerScope) {
    scopedAssigns = scopedAssigns.filter((a) => viewerScope!.storeIds.has(a.store_id));
    const uids = [...new Set(scopedAssigns.map((a) => a.user_id as string))];
    const deptMap = await getUserDeptMap(admin, uids);
    scopedAssigns = scopedAssigns.filter((a) => deptMatches(deptMap.get(a.user_id), viewerScope!.deptIds));
  }

  // Keyed by assignment, not (user, day) — a person can have more than one
  // store visit the same day, each with its own punches.
  const punchesByAssignment = new Map<string, any[]>();
  for (const p of (punches as any[]) ?? []) {
    if (!p.assignment_id) continue;
    const arr = punchesByAssignment.get(p.assignment_id) ?? [];
    arr.push(p);
    punchesByAssignment.set(p.assignment_id, arr);
  }

  const byUser = new Map<string, WeeklyRow>();
  const inMinsByUser = new Map<string, number[]>();
  const outMinsByUser = new Map<string, number[]>();

  for (const a of scopedAssigns) {
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
    const dp = punchesByAssignment.get(a.id) ?? [];
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
const ASSIGNMENT_SELECT =
  "id, roster_id, work_date, mode, windows, store_id, stores ( code, name ), attendance_shift_presets ( mid_photo_min )";

export async function getPunchContext(userId: string, dateISO?: string): Promise<PunchContext> {
  const admin = createAdminClient();
  const today = dateISO || todayIST();
  const yesterday = addDaysISO(today, -1);

  const [{ data: yAssigns }, { data: tAssigns }, { data: ref }, { data: allPunches }] = await Promise.all([
    admin.from("attendance_assignments").select(ASSIGNMENT_SELECT).eq("user_id", userId).eq("work_date", yesterday),
    admin.from("attendance_assignments").select(ASSIGNMENT_SELECT).eq("user_id", userId).eq("work_date", today),
    admin.from("attendance_references").select("user_id").eq("user_id", userId).maybeSingle(),
    admin
      .from("attendance_punches")
      .select("assignment_id, kind, captured_at")
      .eq("user_id", userId)
      .in("work_date", [yesterday, today])
      .order("captured_at"),
  ]);

  const punchesByAssignment = new Map<string, { kind: string; capturedAt: string }[]>();
  for (const p of (allPunches as any[]) ?? []) {
    if (!p.assignment_id) continue;
    const arr = punchesByAssignment.get(p.assignment_id) ?? [];
    arr.push({ kind: p.kind, capturedAt: p.captured_at });
    punchesByAssignment.set(p.assignment_id, arr);
  }

  function toPunchAssignment(a: any, carriedOver: boolean): PunchAssignment {
    return {
      assignmentId: a.id,
      rosterId: a.roster_id,
      workDate: a.work_date,
      carriedOver,
      storeId: a.store_id,
      storeName: a.stores ? `${a.stores.code} — ${a.stores.name}` : "—",
      mode: a.mode === "open" ? "open" : "fixed",
      windows: Array.isArray(a.windows) ? (a.windows as ShiftWindow[]) : [],
      midPhotoMin: a.attendance_shift_presets?.mid_photo_min ?? 0,
      punches: punchesByAssignment.get(a.id) ?? [],
    };
  }

  // Night shifts anchor to the day they started. Any of yesterday's shifts
  // that were checked in but never checked out carry forward so there's
  // still a way to check out after midnight — otherwise someone on a
  // 22:00-06:00 shift would see "no shift today" with no way to finish.
  const carried = ((yAssigns as any[]) ?? [])
    .filter((a) => {
      const kinds = new Set((punchesByAssignment.get(a.id) ?? []).map((p) => p.kind));
      return kinds.has("check_in") && !kinds.has("check_out");
    })
    .map((a) => toPunchAssignment(a, true));

  const todaysOwn = ((tAssigns as any[]) ?? []).map((a) => toPunchAssignment(a, false));

  return {
    today,
    hasReference: !!ref,
    assignments: [...carried, ...todaysOwn],
  };
}
