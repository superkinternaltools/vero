"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";
import { getCurrentProfile } from "@/core/auth/session";
import { distanceMeters } from "@/core/lib/geo";
import { computeCycles } from "./generate";
import { scoreSubmission } from "@/modules/ai-review/score";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Cycle generation only ever upserts — editing a campaign's schedule (e.g.
 * pushing end_date from the 28th to the 31st) changes computeCycles()'s
 * output, but the old due-date's task was never removed, so both live on as
 * separate "pending" tasks forever. This deletes exactly the tasks that are
 * stale under the freshly computed cycle set for this campaign — scoped to
 * status "pending" only, so a task that was ever submitted/approved/rejected,
 * marked not_done, or missed is never touched. */
async function pruneStaleGeneratedTasks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignId: string,
  storeIds: string[],
  validDueDates: string[],
): Promise<void> {
  if (!storeIds.length || !validDueDates.length) return;
  await supabase
    .from("tasks")
    .delete()
    .eq("campaign_id", campaignId)
    .in("store_id", storeIds)
    .eq("status", "pending")
    .not("due_date", "in", `(${validDueDates.join(",")})`);
}

export async function generateTasks(): Promise<{ count: number; error?: string }> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { count: 0, error: "Not authorized." };

  const supabase = await createClient();
  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("id, frequency, start_date, end_date, skip_dates, campaign_stores ( store_id )")
    .eq("status", "active")
    .is("deleted_at", null);
  if (error) return { count: 0, error: error.message };

  const rows: {
    campaign_id: string;
    store_id: string;
    cycle_start: string;
    cycle_end: string;
    due_date: string;
  }[] = [];

  for (const c of (campaigns as any[]) ?? []) {
    if (!c.start_date || !c.end_date) continue;
    const cycles = computeCycles(c.start_date, c.end_date, c.frequency, c.skip_dates ?? []);
    const storeIds = (c.campaign_stores ?? []).map((x: any) => x.store_id);
    for (const store_id of storeIds)
      for (const cyc of cycles)
        rows.push({
          campaign_id: c.id,
          store_id,
          cycle_start: cyc.start,
          cycle_end: cyc.end,
          due_date: cyc.due,
        });
    await pruneStaleGeneratedTasks(supabase, c.id, storeIds, cycles.map((cyc) => cyc.due));
  }

  if (rows.length === 0) return { count: 0 };
  const { error: insErr } = await supabase
    .from("tasks")
    .upsert(rows, { onConflict: "campaign_id,store_id,due_date", ignoreDuplicates: true });
  if (insErr) return { count: 0, error: insErr.message };

  revalidatePath("/tasks");
  return { count: rows.length };
}

export async function submitProof(input: {
  taskId: string;
  campaignId: string;
  storeId: string;
  photos: string[];
  photoHashes: string[];
  comments: string;
  latitude: number | null;
  longitude: number | null;
}): Promise<{ error?: string }> {
  const me = await getCurrentProfile();
  if (!me) return { error: "Not signed in." };
  if (input.photos.length === 0) return { error: "Add at least one photo." };

  const supabase = await createClient();

  // Cycle window check: non-admins can only re-submit approved tasks within the original cycle.
  if (!me.is_admin) {
    const { data: taskRow } = await supabase
      .from("tasks")
      .select("status, cycle_start, cycle_end")
      .eq("id", input.taskId)
      .maybeSingle();
    if (taskRow?.status === "approved") {
      const today = new Date().toISOString().split("T")[0];
      if (today < (taskRow.cycle_start ?? "") || today > (taskRow.cycle_end ?? "")) {
        return { error: "The submission window for this cycle has closed. Re-submission is no longer allowed." };
      }
    }
  }

  // Integrity checks (soft flags for the reviewer — never block the upload).
  let geofenceFlag = false;
  let geofenceDistance: number | null = null;
  let duplicateFlag = false;
  try {
    const admin = createAdminClient();

    // Geofence: compare submission GPS to the store's coordinates.
    if (input.latitude != null && input.longitude != null) {
      const [{ data: store }, { data: radiusRow }] = await Promise.all([
        admin.from("stores").select("latitude, longitude").eq("id", input.storeId).maybeSingle(),
        admin.from("app_settings").select("value").eq("key", "geofence_radius_m").maybeSingle(),
      ]);
      if (store?.latitude != null && store?.longitude != null) {
        geofenceDistance = distanceMeters(
          input.latitude,
          input.longitude,
          store.latitude,
          store.longitude,
        );
        const radius = Number(radiusRow?.value ?? 150);
        geofenceFlag = geofenceDistance > radius;
      }
    }

    // Duplicate: same photo file seen in any earlier submission.
    if (input.photoHashes.length > 0) {
      const { data: dup } = await admin
        .from("submissions")
        .select("id")
        .overlaps("photo_hashes", input.photoHashes)
        .limit(1);
      duplicateFlag = (dup?.length ?? 0) > 0;
    }
  } catch {
    /* flags stay false — never block a field upload on a check failure */
  }

  const { data: subRow, error: subErr } = await supabase
    .from("submissions")
    .insert({
      task_id: input.taskId,
      campaign_id: input.campaignId,
      store_id: input.storeId,
      submitted_by: me.id,
      photos: input.photos,
      photo_hashes: input.photoHashes,
      comments: input.comments || null,
      latitude: input.latitude,
      longitude: input.longitude,
      geofence_flag: geofenceFlag,
      geofence_distance_m: geofenceDistance,
      duplicate_flag: duplicateFlag,
      no_location_flag: input.latitude == null || input.longitude == null,
      status: "pending_review",
    })
    .select("id")
    .single();
  if (subErr) return { error: subErr.message };

  await supabase.from("tasks").update({ status: "submitted" }).eq("id", input.taskId);

  // AI scoring (best-effort; no-op if OPENAI_API_KEY isn't set or campaign AI is off).
  try {
    await scoreSubmission(subRow.id);
  } catch {
    /* falls to manual review */
  }

  revalidatePath("/tasks");
  return {};
}

export async function markNonSubmission(
  taskId: string,
  reason: string,
): Promise<{ error?: string }> {
  if (!reason.trim()) return { error: "Pick a reason." };
  const me = await getCurrentProfile();
  if (!me) return { error: "Not signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: "not_done", non_submission_reason: reason })
    .eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/tasks");
  return {};
}

/** Self-service undo of "Can't do it" — puts the task back to pending so the
 * field user can upload proof after all. Scoped to only-ever-transition a
 * not_done task (can't be used to reset anything else), same minimal-check
 * pattern as markNonSubmission — relies on RLS for store scoping. */
export async function resubmitTask(taskId: string): Promise<{ error?: string }> {
  const me = await getCurrentProfile();
  if (!me) return { error: "Not signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: "pending", non_submission_reason: null, non_submission_acknowledged: false })
    .eq("id", taskId)
    .eq("status", "not_done");
  if (error) return { error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/summary");
  return {};
}

export async function deleteTask(taskId: string): Promise<{ error?: string }> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Only admins can delete tasks." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .in("status", ["pending", "not_done", "missed"]);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return {};
}

export async function autoGenerateTasks(campaignId: string): Promise<void> {
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("campaigns")
    .select("id, frequency, start_date, end_date, skip_dates, campaign_stores ( store_id )")
    .eq("id", campaignId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (!c || !(c as any).start_date || !(c as any).end_date) return;

  const cam = c as any;
  const cycles = computeCycles(cam.start_date, cam.end_date, cam.frequency, cam.skip_dates ?? []);
  const storeIds: string[] = (cam.campaign_stores ?? []).map((x: any) => x.store_id);
  const rows = storeIds.flatMap((store_id) =>
    cycles.map((cyc) => ({
      campaign_id: campaignId,
      store_id,
      cycle_start: cyc.start,
      cycle_end: cyc.end,
      due_date: cyc.due,
    })),
  );
  await pruneStaleGeneratedTasks(supabase, campaignId, storeIds, cycles.map((cyc) => cyc.due));
  if (rows.length === 0) return;
  await supabase
    .from("tasks")
    .upsert(rows, { onConflict: "campaign_id,store_id,due_date", ignoreDuplicates: true });
  revalidatePath("/tasks");
}

export async function acknowledgeNonSubmission(taskId: string): Promise<{ error?: string }> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("tasks")
    .update({ non_submission_acknowledged: true })
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/summary");
  return {};
}

export async function resetTaskToPending(taskId: string): Promise<{ error?: string }> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("tasks")
    .update({ status: "pending", non_submission_reason: null, non_submission_acknowledged: false })
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/summary");
  revalidatePath("/tasks");
  return {};
}

export async function purgePendingTasks(campaignId: string): Promise<void> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  await supabase
    .from("tasks")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .gte("due_date", today);
  revalidatePath("/tasks");
}

/** Hard-deletes every task (any status) for a store that's been removed from a
 * campaign's targeting — otherwise those tasks (and Summary/Leaderboard counts
 * derived from them) live on forever, since task generation only ever upserts,
 * never deletes. Submissions cascade-delete with their task (tasks.id FK). */
export async function pruneTasksForStores(campaignId: string, storeIds: string[]): Promise<void> {
  if (!storeIds.length) return;
  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("campaign_id", campaignId).in("store_id", storeIds);
  revalidatePath("/tasks");
  revalidatePath("/summary");
}
