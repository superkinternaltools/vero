import { createClient } from "@/core/db/server";
import type { TaskRow } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
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

  let q = supabase
    .from("tasks")
    .select(
      `
      id, campaign_id, store_id, due_date, status, non_submission_reason,
      campaigns ( name, instructions, reference_images, capture_mode, num_photos,
                  execution_types ( name ), campaign_job_titles ( job_title_id ) ),
      stores ( name ),
      submissions ( rejection_reason, created_at )
      `,
    )
    .order("due_date", { ascending: true });
  if (!isAdmin) q = q.in("store_id", storeIds);

  const { data } = await q;
  const raw = (data as any[]) ?? [];

  const visible = isAdmin
    ? raw
    : raw.filter((row) => {
        const targets = (row.campaigns?.campaign_job_titles ?? []).map(
          (x: any) => x.job_title_id,
        );
        return targets.length === 0 || (jobTitleId && targets.includes(jobTitleId));
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
      status: row.status,
      instructions: row.campaigns?.instructions ?? null,
      referenceImages: row.campaigns?.reference_images ?? [],
      captureMode: row.campaigns?.capture_mode ?? "camera",
      numPhotos: row.campaigns?.num_photos ?? 1,
      rejectionReason: latestSub?.rejection_reason ?? null,
      nonSubmissionReason: row.non_submission_reason ?? null,
    };
  });
}
