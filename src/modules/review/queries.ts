import { createAdminClient } from "@/core/db/admin";
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
  payoutModel: string;
  payoutTiers: PayoutTier[];
};

export async function listPendingReviews(): Promise<ReviewRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("submissions")
    .select(
      `
      id, created_at, photos, comments, ai_score, ai_verdict, ai_assessment,
      geofence_flag, geofence_distance_m, duplicate_flag,
      campaigns ( name, ai_score_visible, reference_images, payout_model, payout_tiers,
                  campaign_departments ( departments ( name ) ) ),
      stores ( name ),
      submitter:submitted_by ( display_name, email )
      `,
    )
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });

  return ((data as any[]) ?? []).map((row): ReviewRow => ({
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
    payoutModel: row.campaigns?.payout_model ?? "binary",
    payoutTiers: row.campaigns?.payout_tiers ?? [],
  }));
}

export async function listRejectionReasons(): Promise<{ id: string; name: string }[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("rejection_reasons").select("id, name").order("name");
  return (data as { id: string; name: string }[]) ?? [];
}
