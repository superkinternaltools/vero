import type { createClient } from "@/core/db/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** PostgREST caps a single .select() at 1000 rows. campaign_stores alone can
 * exceed that across all campaigns (each campaign can target 100+ stores),
 * and a user assigned to "all stores" can also exceed it in user_stores —
 * either one silently truncating meant some campaigns/stores never made it
 * into the map below, failing the match even when they should pass. Pages
 * through in batches until a short page signals the end. */
async function fetchAllRows(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  pageSize = 1000,
): Promise<any[]> {
  const results: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) {
      console.error("[campaign-scope] query page failed:", error);
      break;
    }
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
  }
  return results;
}

/** Campaign IDs visible to a non-admin user: campaigns tagged with one of
 * their assigned departments (or untagged — departments were never a
 * required field on a campaign) AND targeting one of their assigned stores.
 * A user with no stores assigned at all (normal for store-agnostic roles
 * like Viewer/Reviewer) isn't restricted by store, the same way an untagged
 * campaign isn't restricted by department — only a user who does have
 * specific stores assigned gets narrowed down to those. Shared by
 * Summary and Review so both apply the same visibility rule. */
export async function getAllowedCampaignIdsForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string[]> {
  const [us, ud] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from("user_stores").select("store_id").eq("user_id", userId).range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase.from("user_departments").select("department_id").eq("user_id", userId).range(from, to),
    ),
  ]);
  const storeIds = new Set(us.map((r) => r.store_id as string));
  const deptIds = new Set(ud.map((r) => r.department_id as string));

  const [campaigns, cs, cd] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from("campaigns").select("id").is("deleted_at", null).range(from, to),
    ),
    fetchAllRows((from, to) => supabase.from("campaign_stores").select("campaign_id, store_id").range(from, to)),
    fetchAllRows((from, to) =>
      supabase.from("campaign_departments").select("campaign_id, department_id").range(from, to),
    ),
  ]);

  const campaignStores = new Map<string, string[]>();
  for (const row of cs) {
    const arr = campaignStores.get(row.campaign_id) ?? [];
    arr.push(row.store_id);
    campaignStores.set(row.campaign_id, arr);
  }
  const campaignDepts = new Map<string, string[]>();
  for (const row of cd) {
    const arr = campaignDepts.get(row.campaign_id) ?? [];
    arr.push(row.department_id);
    campaignDepts.set(row.campaign_id, arr);
  }

  return campaigns
    .map((c) => c.id as string)
    .filter((id) => {
      const storeTags = campaignStores.get(id) ?? [];
      const deptTags = campaignDepts.get(id) ?? [];
      const storeMatch = storeIds.size === 0 || storeTags.some((s) => storeIds.has(s));
      const deptMatch = deptTags.length === 0 || deptTags.some((d) => deptIds.has(d));
      return storeMatch && deptMatch;
    });
}
