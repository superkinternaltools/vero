import { createClient } from "@/core/db/server";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ReviewRow = {
  id: string;
  campaignName: string;
  storeName: string;
  departmentName: string | null;
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
};

export async function listPendingReviews(): Promise<ReviewRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("submissions")
    .select(
      `
      id, created_at, photos, comments, ai_score, ai_verdict, ai_assessment,
      geofence_flag, geofence_distance_m, duplicate_flag,
      campaigns ( name, ai_score_visible, reference_images,
                  campaign_departments ( departments ( name ) ) ),
      stores ( name )
      `,
    )
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });

  return ((data as any[]) ?? []).map((row): ReviewRow => ({
    id: row.id,
    campaignName: row.campaigns?.name ?? "—",
    storeName: row.stores?.name ?? "—",
    departmentName: row.campaigns?.campaign_departments?.[0]?.departments?.name ?? null,
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
  }));
}

export async function listRejectionReasons(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("rejection_reasons").select("id, name").order("name");
  return (data as { id: string; name: string }[]) ?? [];
}
