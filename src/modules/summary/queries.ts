import { createClient } from "@/core/db/server";
import type { PayoutTier } from "@/modules/campaigns/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CellData = {
  status: string;
  photos: string[];
  submissionId: string | null;
  submittedByName: string | null;
  aiScore: number | null;
  aiVerdict: string | null;
  aiAssessment: string | null;
  humanVerdict: string | null;
  rejectionReason: string | null;
  geofenceFlag: boolean;
  duplicateFlag: boolean;
  geofenceDistanceM: number | null;
  payoutTierLabel: string | null;
};

export type Matrix = {
  campaignName: string;
  payoutModel: string;
  payoutTiers: PayoutTier[];
  stores: { id: string; name: string }[];
  cycles: string[];
  cells: Record<string, Record<string, CellData>>;
};

export async function listCampaignOptions(): Promise<{ id: string; name: string; status: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data as { id: string; name: string; status: string }[]) ?? [];
}

export async function getCampaignMatrix(id: string): Promise<Matrix | null> {
  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, payout_model, payout_tiers")
    .eq("id", id)
    .maybeSingle();
  if (!campaign) return null;

  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      `
      id, store_id, due_date, status,
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
    const subs = (t.submissions ?? []).slice().sort((a: any, b: any) =>
      (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    );
    const latest = subs[0];
    cells[t.store_id] = cells[t.store_id] ?? {};
    cells[t.store_id][t.due_date] = {
      status: t.status,
      photos: latest?.photos ?? [],
      submissionId: latest?.id ?? null,
      submittedByName: latest?.profiles?.display_name ?? null,
      aiScore: latest?.ai_score ?? null,
      aiVerdict: latest?.ai_verdict ?? null,
      aiAssessment: latest?.ai_assessment ?? null,
      humanVerdict: latest?.human_verdict ?? null,
      rejectionReason: latest?.rejection_reason ?? null,
      geofenceFlag: latest?.geofence_flag ?? false,
      duplicateFlag: latest?.duplicate_flag ?? false,
      geofenceDistanceM: latest?.geofence_distance_m ?? null,
      payoutTierLabel: latest?.payout_tier_label ?? null,
    };
  }

  const stores = [...storeMap.entries()]
    .map(([id2, name]) => ({ id: id2, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const cycles = [...cycleSet].sort();

  const c = campaign as any;
  return {
    campaignName: c.name,
    payoutModel: c.payout_model ?? "binary",
    payoutTiers: c.payout_tiers ?? [],
    stores,
    cycles,
    cells,
  };
}
