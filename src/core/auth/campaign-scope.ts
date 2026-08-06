import type { createClient } from "@/core/db/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  const [{ data: us }, { data: ud }] = await Promise.all([
    supabase.from("user_stores").select("store_id").eq("user_id", userId),
    supabase.from("user_departments").select("department_id").eq("user_id", userId),
  ]);
  const storeIds = new Set(((us as any[]) ?? []).map((r) => r.store_id as string));
  const deptIds = new Set(((ud as any[]) ?? []).map((r) => r.department_id as string));

  const [{ data: campaigns }, { data: cs }, { data: cd }] = await Promise.all([
    supabase.from("campaigns").select("id").is("deleted_at", null),
    supabase.from("campaign_stores").select("campaign_id, store_id"),
    supabase.from("campaign_departments").select("campaign_id, department_id"),
  ]);

  const campaignStores = new Map<string, string[]>();
  for (const row of (cs as any[]) ?? []) {
    const arr = campaignStores.get(row.campaign_id) ?? [];
    arr.push(row.store_id);
    campaignStores.set(row.campaign_id, arr);
  }
  const campaignDepts = new Map<string, string[]>();
  for (const row of (cd as any[]) ?? []) {
    const arr = campaignDepts.get(row.campaign_id) ?? [];
    arr.push(row.department_id);
    campaignDepts.set(row.campaign_id, arr);
  }

  return ((campaigns as any[]) ?? [])
    .map((c) => c.id as string)
    .filter((id) => {
      const storeTags = campaignStores.get(id) ?? [];
      const deptTags = campaignDepts.get(id) ?? [];
      const storeMatch = storeIds.size === 0 || storeTags.some((s) => storeIds.has(s));
      const deptMatch = deptTags.length === 0 || deptTags.some((d) => deptIds.has(d));
      return storeMatch && deptMatch;
    });
}
