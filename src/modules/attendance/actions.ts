"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";
import { getCurrentProfile } from "@/core/auth/session";
import { distanceMeters } from "@/core/lib/geo";
import type { ShiftMode, ShiftWindow } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Result = { error?: string };

async function requireAdmin() {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return null;
  return me;
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// ── presets ─────────────────────────────────────────────────────────────────
export async function savePreset(values: {
  id?: string;
  name: string;
  mode: ShiftMode;
  windows: ShiftWindow[];
  punches: number;
  midPhotoMin: number;
}): Promise<Result> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  if (!values.name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const windows = values.mode === "open" ? { punches: values.punches || 2 } : values.windows;
  const row = {
    name: values.name.trim(),
    mode: values.mode,
    windows,
    mid_photo_min: values.midPhotoMin || 0,
  };
  const { error } = values.id
    ? await supabase.from("attendance_shift_presets").update(row).eq("id", values.id)
    : await supabase.from("attendance_shift_presets").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/attendance/rosters");
  return {};
}

export async function deletePreset(id: string): Promise<Result> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_shift_presets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/attendance/rosters");
  return {};
}

// ── rosters ─────────────────────────────────────────────────────────────────
export async function createRoster(values: {
  name: string;
  startDate: string;
  endDate: string;
  overtimeCapHours: number | null;
  holidayDates: string[];
  memberIds: string[];
}): Promise<Result & { id?: string }> {
  const me = await requireAdmin();
  if (!me) return { error: "Not authorized." };
  if (!values.name.trim()) return { error: "Name is required." };
  if (!values.startDate || !values.endDate) return { error: "Pick a date range." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_rosters")
    .insert({
      name: values.name.trim(),
      start_date: values.startDate,
      end_date: values.endDate,
      overtime_cap_hours: values.overtimeCapHours,
      holiday_dates: values.holidayDates,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  const id = (data as any).id as string;
  if (values.memberIds.length) {
    await supabase
      .from("attendance_roster_members")
      .insert(values.memberIds.map((user_id) => ({ roster_id: id, user_id })));
  }
  revalidatePath("/attendance/rosters");
  return { id };
}

export async function updateRoster(
  id: string,
  values: { name: string; startDate: string; endDate: string; overtimeCapHours: number | null; holidayDates: string[] },
): Promise<Result> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_rosters")
    .update({
      name: values.name.trim(),
      start_date: values.startDate,
      end_date: values.endDate,
      overtime_cap_hours: values.overtimeCapHours,
      holiday_dates: values.holidayDates,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/attendance/rosters");
  return {};
}

export async function deleteRoster(id: string): Promise<Result> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_rosters")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/attendance/rosters");
  return {};
}

export async function addRosterMembers(rosterId: string, userIds: string[]): Promise<Result> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  if (!userIds.length) return {};
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_roster_members")
    .upsert(userIds.map((user_id) => ({ roster_id: rosterId, user_id })), { onConflict: "roster_id,user_id" });
  if (error) return { error: error.message };
  revalidatePath("/attendance/rosters");
  return {};
}

export async function removeRosterMember(rosterId: string, userId: string): Promise<Result> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const supabase = await createClient();
  // Remove the member and any assignments they had on this roster.
  await supabase.from("attendance_assignments").delete().eq("roster_id", rosterId).eq("user_id", userId);
  const { error } = await supabase
    .from("attendance_roster_members")
    .delete()
    .eq("roster_id", rosterId)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/attendance/rosters");
  return {};
}

// ── assignments (grid cells) ─────────────────────────────────────────────────
export async function upsertAssignment(input: {
  rosterId: string;
  userId: string;
  workDate: string;
  presetId: string | null;
  mode: ShiftMode;
  windows: ShiftWindow[];
  punches?: number;
  storeId: string;
}): Promise<Result> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const supabase = await createClient();
  const windows = input.mode === "open" ? ({ punches: input.punches ?? 2 } as any) : input.windows;
  const { error } = await supabase.from("attendance_assignments").upsert(
    {
      roster_id: input.rosterId,
      user_id: input.userId,
      work_date: input.workDate,
      preset_id: input.presetId,
      mode: input.mode,
      windows,
      store_id: input.storeId,
    },
    { onConflict: "user_id,work_date" },
  );
  if (error) return { error: error.message };
  revalidatePath("/attendance/rosters");
  return {};
}

/** Copies every assignment from one week onto another (7 days, same weekday
 * offset). Overwrites whatever's already in the target week. Skips any
 * resulting date outside the roster's own date range or on a holiday. */
export async function copyWeek(
  rosterId: string,
  fromWeekStart: string,
  toWeekStart: string,
): Promise<Result & { copied?: number }> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const supabase = await createClient();

  const { data: roster } = await supabase
    .from("attendance_rosters")
    .select("start_date, end_date, holiday_dates")
    .eq("id", rosterId)
    .maybeSingle();
  if (!roster) return { error: "Roster not found." };

  const fromDays = Array.from({ length: 7 }, (_, i) => addDaysISO(fromWeekStart, i));
  const { data: assigns } = await supabase
    .from("attendance_assignments")
    .select("user_id, work_date, preset_id, mode, windows, store_id")
    .eq("roster_id", rosterId)
    .in("work_date", fromDays);

  if (!assigns || assigns.length === 0) return { copied: 0 };

  const holidays = new Set((roster as any).holiday_dates ?? []);
  const rows = (assigns as any[])
    .map((a) => {
      const offset = fromDays.indexOf(a.work_date);
      return { ...a, work_date: addDaysISO(toWeekStart, offset) };
    })
    .filter(
      (a) =>
        a.work_date >= (roster as any).start_date &&
        a.work_date <= (roster as any).end_date &&
        !holidays.has(a.work_date),
    );

  if (rows.length === 0) return { copied: 0 };

  const { error } = await supabase.from("attendance_assignments").upsert(
    rows.map((a) => ({
      roster_id: rosterId,
      user_id: a.user_id,
      work_date: a.work_date,
      preset_id: a.preset_id,
      mode: a.mode,
      windows: a.windows,
      store_id: a.store_id,
    })),
    { onConflict: "user_id,work_date" },
  );
  if (error) return { error: error.message };

  revalidatePath("/attendance/rosters");
  return { copied: rows.length };
}

export async function clearAssignment(userId: string, workDate: string): Promise<Result> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_assignments")
    .delete()
    .eq("user_id", userId)
    .eq("work_date", workDate);
  if (error) return { error: error.message };
  revalidatePath("/attendance/rosters");
  return {};
}

// ── bulk upload ──────────────────────────────────────────────────────────────
export type BulkRow = { employee: string; preset: string; store: string; weekdays: string; start: string; end: string };
export type BulkPreview = {
  index: number;
  employee: string;
  preset: string;
  store: string;
  weekdays: string;
  ok: boolean;
  error: string | null;
};

async function resolveBulk() {
  const admin = createAdminClient();
  const [{ data: profiles }, { data: stores }, { data: presets }] = await Promise.all([
    admin.from("profiles").select("id, email, display_name").is("deleted_at", null),
    admin.from("stores").select("id, code").is("deleted_at", null),
    admin.from("attendance_shift_presets").select("id, name, mode, windows, mid_photo_min").is("deleted_at", null),
  ]);
  const byEmail = new Map<string, string>();
  for (const p of (profiles as any[]) ?? []) byEmail.set((p.email ?? "").toLowerCase(), p.id);
  const byCode = new Map<string, string>();
  for (const s of (stores as any[]) ?? []) byCode.set((s.code ?? "").toLowerCase(), s.id);
  const byPreset = new Map<string, any>();
  for (const p of (presets as any[]) ?? []) byPreset.set((p.name ?? "").toLowerCase(), p);
  return { byEmail, byCode, byPreset };
}

function parsePresetCell(cell: string, byPreset: Map<string, any>): { mode: ShiftMode; windows: any; presetId: string | null; midPhotoMin: number } | null {
  const preset = byPreset.get(cell.trim().toLowerCase());
  if (preset) {
    return {
      mode: preset.mode === "open" ? "open" : "fixed",
      windows: preset.windows,
      presetId: preset.id,
      midPhotoMin: preset.mid_photo_min ?? 0,
    };
  }
  const m = cell.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (m) {
    const windows: ShiftWindow[] = [
      { label: "Check-in", start: m[1], end: m[1], graceMin: 30 },
      { label: "Check-out", start: m[2], end: m[2], graceMin: 0 },
    ];
    return { mode: "fixed", windows, presetId: null, midPhotoMin: 0 };
  }
  return null;
}

export async function validateBulk(rows: BulkRow[]): Promise<{ preview: BulkPreview[] }> {
  if (!(await requireAdmin())) return { preview: [] };
  const { byEmail, byCode, byPreset } = await resolveBulk();
  const preview = rows.map((r, i): BulkPreview => {
    const errors: string[] = [];
    if (!byEmail.has(r.employee.trim().toLowerCase())) errors.push("unknown employee");
    if (!byCode.has(r.store.trim().toLowerCase())) errors.push("store not found");
    if (!parsePresetCell(r.preset, byPreset)) errors.push("unknown preset/time");
    const wd = r.weekdays.split(/[,;]/).map((d) => d.trim().slice(0, 3).toLowerCase()).filter(Boolean);
    if (!wd.length || wd.some((d) => !(d in DOW))) errors.push("bad weekdays");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.start) || !/^\d{4}-\d{2}-\d{2}$/.test(r.end)) errors.push("bad dates");
    return {
      index: i,
      employee: r.employee,
      preset: r.preset,
      store: r.store,
      weekdays: r.weekdays,
      ok: errors.length === 0,
      error: errors.length ? errors.join(", ") : null,
    };
  });
  return { preview };
}

export async function applyBulk(rosterId: string, rows: BulkRow[]): Promise<Result & { created?: number }> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const supabase = await createClient();
  const admin = createAdminClient();
  const { byEmail, byCode, byPreset } = await resolveBulk();

  const { data: roster } = await admin
    .from("attendance_rosters")
    .select("start_date, end_date")
    .eq("id", rosterId)
    .maybeSingle();
  if (!roster) return { error: "Roster not found." };
  const rStart = (roster as any).start_date as string;
  const rEnd = (roster as any).end_date as string;

  const memberIds = new Set<string>();
  const assignments: any[] = [];

  for (const r of rows) {
    const userId = byEmail.get(r.employee.trim().toLowerCase());
    const storeId = byCode.get(r.store.trim().toLowerCase());
    const resolved = parsePresetCell(r.preset, byPreset);
    const wd = new Set(r.weekdays.split(/[,;]/).map((d) => DOW[d.trim().slice(0, 3).toLowerCase()]).filter((n) => n !== undefined));
    if (!userId || !storeId || !resolved || !wd.size) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.start) || !/^\d{4}-\d{2}-\d{2}$/.test(r.end)) continue;

    memberIds.add(userId);
    const from = r.start > rStart ? r.start : rStart;
    const to = r.end < rEnd ? r.end : rEnd;
    for (let d = from; d <= to; d = addDaysISO(d, 1)) {
      const dow = new Date(d + "T00:00:00Z").getUTCDay();
      if (!wd.has(dow)) continue;
      assignments.push({
        roster_id: rosterId,
        user_id: userId,
        work_date: d,
        preset_id: resolved.presetId,
        mode: resolved.mode,
        windows: resolved.windows,
        store_id: storeId,
      });
    }
  }

  if (memberIds.size) {
    await supabase
      .from("attendance_roster_members")
      .upsert([...memberIds].map((user_id) => ({ roster_id: rosterId, user_id })), { onConflict: "roster_id,user_id" });
  }
  if (assignments.length) {
    const { error } = await supabase
      .from("attendance_assignments")
      .upsert(assignments, { onConflict: "user_id,work_date" });
    if (error) return { error: error.message };
  }
  revalidatePath("/attendance/rosters");
  return { created: assignments.length };
}

// ── punches ──────────────────────────────────────────────────────────────────
export async function recordPunch(input: {
  kind: "check_in" | "check_out" | "mid";
  workDate: string;
  assignmentId: string | null;
  rosterId: string | null;
  storeId: string | null;
  photoPath: string;
  latitude: number | null;
  longitude: number | null;
}): Promise<Result> {
  const me = await getCurrentProfile();
  if (!me) return { error: "Not signed in." };
  if (!input.photoPath) return { error: "A photo is required." };

  const admin = createAdminClient();

  let geofenceFlag = false;
  let geofenceDistance: number | null = null;
  const noLocation = input.latitude == null || input.longitude == null;
  try {
    if (!noLocation && input.storeId) {
      const [{ data: store }, { data: radiusRow }] = await Promise.all([
        admin.from("stores").select("latitude, longitude").eq("id", input.storeId).maybeSingle(),
        admin.from("app_settings").select("value").eq("key", "attendance_geofence_radius_m").maybeSingle(),
      ]);
      if (store?.latitude != null && store?.longitude != null) {
        geofenceDistance = distanceMeters(input.latitude!, input.longitude!, store.latitude, store.longitude);
        geofenceFlag = geofenceDistance > Number(radiusRow?.value ?? 150);
      }
    }
  } catch {
    /* never block a punch on a check failure */
  }

  const { error } = await admin.from("attendance_punches").insert({
    user_id: me.id,
    assignment_id: input.assignmentId,
    roster_id: input.rosterId,
    work_date: input.workDate,
    kind: input.kind,
    photo_path: input.photoPath,
    store_id: input.storeId,
    latitude: input.latitude,
    longitude: input.longitude,
    geofence_distance_m: geofenceDistance,
    geofence_flag: geofenceFlag,
    no_location_flag: noLocation,
  });
  if (error) return { error: error.message };

  // First photo ever becomes the reference.
  const { data: ref } = await admin
    .from("attendance_references")
    .select("user_id")
    .eq("user_id", me.id)
    .maybeSingle();
  if (!ref) {
    await admin.from("attendance_references").insert({
      user_id: me.id,
      photo_path: input.photoPath,
    });
  }

  revalidatePath("/attendance/punch");
  return {};
}

export async function resetReference(userId: string): Promise<Result> {
  const me = await requireAdmin();
  if (!me) return { error: "Not authorized." };
  const admin = createAdminClient();
  const { error } = await admin.from("attendance_references").delete().eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/attendance");
  return {};
}

export async function markPunchReviewed(punchId: string): Promise<Result> {
  const me = await requireAdmin();
  if (!me) return { error: "Not authorized." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("attendance_punches")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: me.id })
    .eq("id", punchId);
  if (error) return { error: error.message };
  revalidatePath("/attendance");
  return {};
}
