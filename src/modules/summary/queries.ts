import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";
import type { PayoutTier } from "@/modules/campaigns/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SubmissionEntry = {
  id: string;
  photos: string[];
  aiScore: number | null;
  aiVerdict: string | null;
  aiAssessment: string | null;
  humanVerdict: string | null;
  rejectionReason: string | null;
  geofenceFlag: boolean;
  duplicateFlag: boolean;
  geofenceDistanceM: number | null;
  payoutTierLabel: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
};

export type CellData = {
  taskId: string;
  status: string;
  photos: string[];
  submissionId: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  aiScore: number | null;
  aiVerdict: string | null;
  aiAssessment: string | null;
  humanVerdict: string | null;
  rejectionReason: string | null;
  geofenceFlag: boolean;
  duplicateFlag: boolean;
  geofenceDistanceM: number | null;
  payoutTierLabel: string | null;
  nonSubmissionReason: string | null;
  nonSubmissionAcknowledged: boolean;
  allSubmissions: SubmissionEntry[];
};

export type Matrix = {
  campaignName: string;
  payoutModel: string;
  payoutTiers: PayoutTier[];
  aiReview: boolean;
  stores: { id: string; name: string }[];
  cycles: string[];
  cells: Record<string, Record<string, CellData>>;
};

/** Campaign IDs visible to this user: campaigns targeting BOTH one of their
 * assigned stores AND one of their assigned departments (a campaign with no
 * department tagged at all is treated as visible to everyone, since
 * departments were never a required field on a campaign). No stores
 * assigned means nothing can match, so an empty list is returned. */
async function getAllowedCampaignIdsForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string[]> {
  const [{ data: us }, { data: ud }] = await Promise.all([
    supabase.from("user_stores").select("store_id").eq("user_id", userId),
    supabase.from("user_departments").select("department_id").eq("user_id", userId),
  ]);
  const storeIds = new Set(((us as any[]) ?? []).map((r) => r.store_id as string));
  const deptIds = new Set(((ud as any[]) ?? []).map((r) => r.department_id as string));
  if (storeIds.size === 0) return [];

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
      const storeMatch = storeTags.some((s) => storeIds.has(s));
      const deptMatch = deptTags.length === 0 || deptTags.some((d) => deptIds.has(d));
      return storeMatch && deptMatch;
    });
}

export async function listCampaignOptions(scope: {
  userId: string;
  isAdmin: boolean;
}): Promise<{ id: string; name: string; status: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  let list = (data as { id: string; name: string; status: string }[]) ?? [];
  if (!scope.isAdmin) {
    const allowed = new Set(await getAllowedCampaignIdsForUser(supabase, scope.userId));
    list = list.filter((c) => allowed.has(c.id));
  }
  return list;
}

function rankSub(s: any, payoutTiers: PayoutTier[]): number {
  if (s.human_verdict === "approved") {
    if (s.payout_tier_label) {
      const tier = payoutTiers.find((t) => t.label === s.payout_tier_label);
      return 3000 + (tier?.pct ?? 0);
    }
    return 3000;
  }
  if (s.human_verdict === "rejected") return 2000;
  if (s.ai_score != null) return 1000 + Number(s.ai_score);
  return 0;
}

export async function getCampaignMatrix(
  id: string,
  scope: { userId: string; isAdmin: boolean },
): Promise<Matrix | null> {
  const supabase = await createClient();

  if (!scope.isAdmin) {
    const allowed = await getAllowedCampaignIdsForUser(supabase, scope.userId);
    if (!allowed.includes(id)) return null;
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, payout_model, payout_tiers, ai_review")
    .eq("id", id)
    .maybeSingle();
  if (!campaign) return null;

  const c = campaign as any;
  const payoutTiers: PayoutTier[] = c.payout_tiers ?? [];

  // tasks/submissions are RLS-restricted to admins (or, for tasks, a
  // field-user's own linked store) — a viewer/reviewer opening someone
  // else's campaign matrix can't read either via the regular client.
  // Access is already gated above by the store+department scoping check.
  const admin = createAdminClient();
  const { data: tasks } = await admin
    .from("tasks")
    .select(
      `
      id, store_id, due_date, status, non_submission_reason, non_submission_acknowledged,
      stores ( name ),
      submissions ( id, photos, ai_score, ai_verdict, ai_assessment, human_verdict, rejection_reason, geofence_flag, duplicate_flag, geofence_distance_m, payout_tier_label, created_at, submitted_by, profiles ( display_name ) )
      `,
    )
    .eq("campaign_id", id)
    .order("due_date", { ascending: true });

  const storeMap = new Map<string, string>();
  const cycleSet = new Set<string>();
  const cells: Record<string, Record<string, CellData>> = {};

  for (const t of (tasks as any[]) ?? []) {
    storeMap.set(t.store_id, t.stores?.name ?? "—");
    cycleSet.add(t.due_date);

    // Sort best-first: human approved (highest tier) > rejected > AI scored > none.
    // Within same rank, latest created_at wins.
    const subs = (t.submissions ?? []).slice().sort((a: any, b: any) => {
      const rankDiff = rankSub(b, payoutTiers) - rankSub(a, payoutTiers);
      if (rankDiff !== 0) return rankDiff;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
    const best = subs[0];

    cells[t.store_id] = cells[t.store_id] ?? {};
    cells[t.store_id][t.due_date] = {
      taskId: t.id,
      status: t.status,
      photos: best?.photos ?? [],
      submissionId: best?.id ?? null,
      submittedByName: best?.profiles?.display_name ?? null,
      submittedAt: best?.created_at ?? null,
      aiScore: best?.ai_score ?? null,
      aiVerdict: best?.ai_verdict ?? null,
      aiAssessment: best?.ai_assessment ?? null,
      humanVerdict: best?.human_verdict ?? null,
      rejectionReason: best?.rejection_reason ?? null,
      geofenceFlag: best?.geofence_flag ?? false,
      duplicateFlag: best?.duplicate_flag ?? false,
      geofenceDistanceM: best?.geofence_distance_m ?? null,
      payoutTierLabel: best?.payout_tier_label ?? null,
      nonSubmissionReason: t.non_submission_reason ?? null,
      nonSubmissionAcknowledged: t.non_submission_acknowledged ?? false,
      allSubmissions: subs.map((s: any) => ({
        id: s.id,
        photos: s.photos ?? [],
        aiScore: s.ai_score ?? null,
        aiVerdict: s.ai_verdict ?? null,
        aiAssessment: s.ai_assessment ?? null,
        humanVerdict: s.human_verdict ?? null,
        rejectionReason: s.rejection_reason ?? null,
        geofenceFlag: s.geofence_flag ?? false,
        duplicateFlag: s.duplicate_flag ?? false,
        geofenceDistanceM: s.geofence_distance_m ?? null,
        payoutTierLabel: s.payout_tier_label ?? null,
        submittedAt: s.created_at ?? null,
        submittedByName: s.profiles?.display_name ?? null,
      })),
    };
  }

  const stores = [...storeMap.entries()]
    .map(([id2, name]) => ({ id: id2, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const cycles = [...cycleSet].sort();

  return {
    campaignName: c.name,
    payoutModel: c.payout_model ?? "binary",
    payoutTiers: c.payout_tiers ?? [],
    aiReview: c.ai_review ?? false,
    stores,
    cycles,
    cells,
  };
}
