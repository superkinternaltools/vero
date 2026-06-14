import { createClient } from "@/core/db/server";

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

export async function getLeaderboardFilters(): Promise<{
  jobTitles: { id: string; name: string }[];
  campaigns: { id: string; name: string; status: string }[];
}> {
  const supabase = await createClient();
  const [{ data: jobTitles }, { data: campaigns }] = await Promise.all([
    supabase.from("job_titles").select("id, name").order("name"),
    supabase.from("campaigns").select("id, name, status").is("deleted_at", null).order("name"),
  ]);
  return {
    jobTitles: (jobTitles ?? []) as { id: string; name: string }[],
    campaigns: (campaigns ?? []) as { id: string; name: string; status: string }[],
  };
}

export async function getJobTitleLeaderboard(params: {
  jobTitleId: string;
  campaignIds: string[];
  dateFrom: string;
  dateTo: string;
}): Promise<JobTitleRank[]> {
  const supabase = await createClient();

  // 1. Get all active users with this job title
  const { data: profiles } = await supabase
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
    let q = supabase
      .from("tasks")
      .select("store_id, status")
      .gte("due_date", params.dateFrom)
      .lte("due_date", params.dateTo)
      .in("store_id", allStoreIds);
    if (params.campaignIds.length > 0) q = q.in("campaign_id", params.campaignIds);
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
