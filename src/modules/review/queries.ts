import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";
import { getAllowedCampaignIdsForUser } from "@/core/auth/campaign-scope";
import type { PayoutTier } from "@/modules/campaigns/types";

// Admin client used so reviewers (non-admin) can read the review queue.
// RLS on submissions only covers admins and field users; reviewers have no read policy.
// Page access is enforced by requireAccess("review") before this query runs.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ReviewRow = {
  id: string;
  campaignName: string;
  storeName: string;
  departmentName: string | null;
  submittedByName: string | null;
  submittedAt: string;
  aiScore: number | null;
  aiVerdict: string | null;
  aiAssessment: string | null;
  aiScoreVisible: boolean;
  referenceImages: string[];
  photos: string[];
  comments: string | null;
  geofenceFlag: boolean;
  geofenceDistanceM: number | null;
  duplicateFlag: boolean;
  noLocationFlag: boolean;
  payoutModel: string;
  payoutTiers: PayoutTier[];
};

/** PostgREST caps a single .select() at 1000 rows — with more than 1000
 * pending_review submissions system-wide, the oldest 1000 (by created_at)
 * were silently the only ones ever fetched, so anything past that window
 * (e.g. a department's newer submissions) never even reached the
 * allowed-campaign filter below. Pages through in batches until a short
 * page signals the end. */
async function fetchAllPendingReviewRows(
  admin: ReturnType<typeof createAdminClient>,
  pageSize = 1000,
): Promise<any[]> {
  const results: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("submissions")
      .select(
        `
        id, campaign_id, created_at, photos, comments, ai_score, ai_verdict, ai_assessment,
        geofence_flag, geofence_distance_m, duplicate_flag, no_location_flag,
        campaigns ( name, ai_score_visible, reference_images, payout_model, payout_tiers,
                    campaign_departments ( departments ( name ) ) ),
        stores ( name ),
        submitter:submitted_by ( display_name, email )
        `,
      )
      .eq("status", "pending_review")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("[review] query page failed:", error);
      break;
    }
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
  }
  return results;
}

export async function listPendingReviews(scope: {
  userId: string;
  isAdmin: boolean;
}): Promise<ReviewRow[]> {
  let allowedCampaignIds: Set<string> | null = null;
  if (!scope.isAdmin) {
    const supabase = await createClient();
    allowedCampaignIds = new Set(await getAllowedCampaignIdsForUser(supabase, scope.userId));
  }

  const admin = createAdminClient();
  const data = await fetchAllPendingReviewRows(admin);

  const rows = data.filter(
    (row) => !allowedCampaignIds || allowedCampaignIds.has(row.campaign_id),
  );

  return rows.map((row): ReviewRow => ({
    id: row.id,
    campaignName: row.campaigns?.name ?? "—",
    storeName: row.stores?.name ?? "—",
    departmentName: row.campaigns?.campaign_departments?.[0]?.departments?.name ?? null,
    submittedByName: row.submitter?.display_name ?? row.submitter?.email ?? null,
    submittedAt: row.created_at,
    aiScore: row.ai_score,
    aiVerdict: row.ai_verdict,
    aiAssessment: row.ai_assessment,
    aiScoreVisible: row.campaigns?.ai_score_visible ?? true,
    referenceImages: row.campaigns?.reference_images ?? [],
    photos: row.photos ?? [],
    comments: row.comments,
    geofenceFlag: !!row.geofence_flag,
    geofenceDistanceM: row.geofence_distance_m,
    duplicateFlag: !!row.duplicate_flag,
    noLocationFlag: !!row.no_location_flag,
    payoutModel: row.campaigns?.payout_model ?? "binary",
    payoutTiers: row.campaigns?.payout_tiers ?? [],
  }));
}

export async function listRejectionReasons(): Promise<{ id: string; name: string }[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("rejection_reasons").select("id, name").order("name");
  return (data as { id: string; name: string }[]) ?? [];
}
