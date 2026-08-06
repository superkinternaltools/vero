import { createClient } from "@/core/db/server";
import type { TaskRow } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** PostgREST caps a single .select() at 1000 rows — an admin's view has no
 * store filter, so "every task with today in its cycle window, across every
 * store" can easily exceed that (seen in practice: exactly 1000 assigned).
 * Pages through in batches until a short page signals the end. */
async function fetchAllRows(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  pageSize = 1000,
): Promise<any[]> {
  const results: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) {
      console.error("[getMyTasks] query page failed:", error);
      break;
    }
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
  }
  return results;
}

export async function getMyTasks(): Promise<TaskRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, job_title_id")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = !!profile?.is_admin;
  const jobTitleId: string | null = profile?.job_title_id ?? null;

  let storeIds: string[] = [];
  if (!isAdmin) {
    const { data: us } = await supabase
      .from("user_stores")
      .select("store_id")
      .eq("user_id", user.id);
    storeIds = (us ?? []).map((x: any) => x.store_id);
    if (storeIds.length === 0) return [];
  }

  // Use IST (UTC+5:30) so the cycle window matches the Indian calendar day,
  // not UTC which can be a day behind between midnight–5:30 AM IST.
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  // Current IST time as "HH:MM" for submission window comparisons.
  const istTime = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Filter at the DB level so we only fetch current-cycle tasks — narrows
  // the result a lot, but an admin's view (no store filter) can still
  // exceed PostgREST's 1000-row cap across every store/campaign, so this
  // still needs to paginate rather than trust a single page is everything.
  const raw = await fetchAllRows((from, to) => {
    let q = supabase
      .from("tasks")
      .select(
        `
        id, campaign_id, store_id, due_date, cycle_start, cycle_end, status, non_submission_reason,
        campaigns ( name, frequency, instructions, reference_images, capture_mode, num_photos,
                    submission_window_start, submission_window_end,
                    execution_types ( name ), campaign_job_titles ( job_title_id ) ),
        stores ( name ),
        submissions ( rejection_reason, photos, created_at )
        `,
      )
      .lte("cycle_start", todayStr)
      .gte("cycle_end", todayStr)
      .order("due_date", { ascending: true })
      .range(from, to);
    if (!isAdmin) q = q.in("store_id", storeIds);
    return q;
  });

  const visible = raw.filter((row) => {
    // Job title targeting — skip for admins
    if (!isAdmin) {
      const targets = (row.campaigns?.campaign_job_titles ?? []).map(
        (x: any) => x.job_title_id,
      );
      if (targets.length > 0 && (!jobTitleId || !targets.includes(jobTitleId))) return false;
    }
    // Submission window — hide tasks outside their allowed time window.
    // Already-submitted/approved/rejected tasks are always shown regardless of window.
    const winStart: string | null = row.campaigns?.submission_window_start ?? null;
    const winEnd: string | null = row.campaigns?.submission_window_end ?? null;
    if (winStart && winEnd && row.status === "pending") {
      if (istTime < winStart || istTime >= winEnd) return false;
    }
    return true;
  });

  return visible.map((row): TaskRow => {
    const latestSub = (row.submissions ?? [])
      .slice()
      .sort((a: any, b: any) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
    return {
      id: row.id,
      campaignId: row.campaign_id,
      storeId: row.store_id,
      campaignName: row.campaigns?.name ?? "—",
      executionTypeName: row.campaigns?.execution_types?.name ?? null,
      storeName: row.stores?.name ?? "—",
      dueDate: row.due_date,
      cycleStart: row.cycle_start ?? row.due_date,
      cycleEnd: row.cycle_end ?? row.due_date,
      frequency: row.campaigns?.frequency ?? "weekly",
      status: row.status,
      instructions: row.campaigns?.instructions ?? null,
      referenceImages: row.campaigns?.reference_images ?? [],
      captureMode: row.campaigns?.capture_mode ?? "camera",
      numPhotos: row.campaigns?.num_photos ?? 1,
      rejectionReason: latestSub?.rejection_reason ?? null,
      nonSubmissionReason: row.non_submission_reason ?? null,
      submittedPhotos: latestSub?.photos ?? [],
      windowStart: row.campaigns?.submission_window_start ?? null,
      windowEnd: row.campaigns?.submission_window_end ?? null,
    };
  });
}
