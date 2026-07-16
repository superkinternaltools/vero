import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type StoreRank = {
  id: string;
  name: string;
  assigned: number;
  done: number;
  approved: number;
  completionPct: number;
  approvalPct: number;
};

export type JobTitleRank = {
  userId: string;
  name: string;
  assigned: number;
  done: number;
  approved: number;
  completionPct: number;
  approvalPct: number;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/** Campaign IDs visible to this user: campaigns tagged with one of their
 * departments, plus any campaign with no department tagged at all (treated
 * as visible to everyone, since departments were never a required field on
 * a campaign). If the user has no departments assigned, only the untagged
 * campaigns are returned. */
export async function getAllowedCampaignIdsForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string[]> {
  const { data: ud } = await supabase
    .from("user_departments")
    .select("department_id")
    .eq("user_id", userId);
  const deptIds = new Set(((ud as any[]) ?? []).map((r) => r.department_id as string));

  const [{ data: campaigns }, { data: cd }] = await Promise.all([
    supabase.from("campaigns").select("id").is("deleted_at", null),
    supabase.from("campaign_departments").select("campaign_id, department_id"),
  ]);

  const campaignDepts = new Map<string, string[]>();
  for (const row of (cd as any[]) ?? []) {
    const arr = campaignDepts.get(row.campaign_id) ?? [];
    arr.push(row.department_id);
    campaignDepts.set(row.campaign_id, arr);
  }

  return ((campaigns as any[]) ?? [])
    .map((c) => c.id as string)
    .filter((id) => {
      const tags = campaignDepts.get(id);
      return !tags || tags.length === 0 || tags.some((d) => deptIds.has(d));
    });
}

export async function getLeaderboardFilters(scope: {
  userId: string;
  isAdmin: boolean;
}): Promise<{
  jobTitles: { id: string; name: string }[];
  campaigns: { id: string; name: string; status: string }[];
}> {
  const supabase = await createClient();
  const [{ data: jobTitles }, { data: campaigns }] = await Promise.all([
    supabase.from("job_titles").select("id, name").order("name"),
    supabase.from("campaigns").select("id, name, status").is("deleted_at", null).order("name"),
  ]);

  let scopedCampaigns = (campaigns ?? []) as { id: string; name: string; status: string }[];
  if (!scope.isAdmin) {
    const allowed = new Set(await getAllowedCampaignIdsForUser(supabase, scope.userId));
    scopedCampaigns = scopedCampaigns.filter((c) => allowed.has(c.id));
  }

  return {
    jobTitles: (jobTitles ?? []) as { id: string; name: string }[],
    campaigns: scopedCampaigns,
  };
}

export async function getJobTitleLeaderboard(params: {
  jobTitleId: string;
  campaignIds: string[];
  dateFrom: string;
  dateTo: string;
  userId: string;
  isAdmin: boolean;
}): Promise<JobTitleRank[]> {
  const supabase = await createClient();
  // profiles and tasks are RLS-restricted to admins (or, for tasks, a
  // field-user's own linked store) — a viewer/reviewer ranking OTHER
  // people's performance can't read either table via the regular client.
  // Reads are gated by our own department scoping below instead.
  const admin = createAdminClient();

  // Non-admins only see tasks from campaigns in their own department(s).
  let effectiveCampaignIds = params.campaignIds;
  if (!params.isAdmin) {
    const allowed = await getAllowedCampaignIdsForUser(supabase, params.userId);
    if (allowed.length === 0) return [];
    effectiveCampaignIds =
      params.campaignIds.length > 0
        ? params.campaignIds.filter((id) => allowed.includes(id))
        : allowed;
    if (effectiveCampaignIds.length === 0) return [];
  }

  // 1. Get all active users with this job title
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("job_title_id", params.jobTitleId)
    .eq("status", "active");

  if (!profiles?.length) return [];

  const profileIds = (profiles as any[]).map((p) => p.id as string);

  // 2. Get their store assignments
  const { data: userStoreRows } = await supabase
    .from("user_stores")
    .select("user_id, store_id")
    .in("user_id", profileIds);

  // Build maps
  const storeToUsers = new Map<string, string[]>();
  const userMap = new Map<string, string>();
  for (const p of profiles as any[]) userMap.set(p.id, p.display_name ?? "—");

  for (const us of (userStoreRows as any[]) ?? []) {
    const arr = storeToUsers.get(us.store_id) ?? [];
    arr.push(us.user_id);
    storeToUsers.set(us.store_id, arr);
  }

  const userStats = new Map<string, { assigned: number; done: number; approved: number }>();
  for (const uid of userMap.keys()) userStats.set(uid, { assigned: 0, done: 0, approved: 0 });

  const allStoreIds = [...storeToUsers.keys()];
  if (allStoreIds.length > 0) {
    // 3. Get tasks for those stores in range
    let q = admin
      .from("tasks")
      .select("store_id, status")
      .gte("due_date", params.dateFrom)
      .lte("due_date", params.dateTo)
      .in("store_id", allStoreIds);
    if (!params.isAdmin) q = q.in("campaign_id", effectiveCampaignIds);
    else if (params.campaignIds.length > 0) q = q.in("campaign_id", params.campaignIds);
    const { data: tasks } = await q;

    // 4. Attribute each task to all users linked to that store
    for (const t of (tasks as any[]) ?? []) {
      for (const uid of (storeToUsers.get(t.store_id) ?? [])) {
        const s = userStats.get(uid);
        if (!s) continue;
        s.assigned += 1;
        if (["submitted", "approved", "rejected"].includes(t.status)) s.done += 1;
        if (t.status === "approved") s.approved += 1;
      }
    }
  }

  return [...userMap.entries()]
    .map(([uid, name]) => {
      const s = userStats.get(uid)!;
      return {
        userId: uid,
        name,
        assigned: s.assigned,
        done: s.done,
        approved: s.approved,
        completionPct: pct(s.done, s.assigned),
        approvalPct: pct(s.approved, s.done),
      };
    })
    .sort((a, b) => b.completionPct - a.completionPct || b.assigned - a.assigned);
}

export async function getStoreLeaderboard(params: {
  campaignIds: string[];
  dateFrom: string;
  dateTo: string;
}): Promise<StoreRank[]> {
  const supabase = await createClient();
  let q = supabase
    .from("tasks")
    .select("store_id, status, stores ( name )")
    .gte("due_date", params.dateFrom)
    .lte("due_date", params.dateTo);
  if (params.campaignIds.length > 0) q = q.in("campaign_id", params.campaignIds);
  const { data } = await q;

  const map = new Map<string, { name: string; assigned: number; done: number; approved: number }>();
  for (const t of (data as any[]) ?? []) {
    const m = map.get(t.store_id) ?? { name: t.stores?.name ?? "—", assigned: 0, done: 0, approved: 0 };
    m.assigned += 1;
    if (["submitted", "approved", "rejected"].includes(t.status)) m.done += 1;
    if (t.status === "approved") m.approved += 1;
    map.set(t.store_id, m);
  }
  return [...map.entries()]
    .map(([id, m]) => ({
      id,
      name: m.name,
      assigned: m.assigned,
      done: m.done,
      approved: m.approved,
      completionPct: pct(m.done, m.assigned),
      approvalPct: pct(m.approved, m.done),
    }))
    .sort((a, b) => b.completionPct - a.completionPct || b.assigned - a.assigned);
}
