import { createClient } from "@/core/db/server";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CellData = {
  status: string;
  photos: string[];
  submissionId: string | null;
  aiScore: number | null;
  rejectionReason: string | null;
};

export type Matrix = {
  campaignName: string;
  stores: { id: string; name: string }[];
  cycles: string[];
  cells: Record<string, Record<string, CellData>>;
};

export async function listCampaignOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, name")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data as { id: string; name: string }[]) ?? [];
}

export async function getCampaignMatrix(id: string): Promise<Matrix | null> {
  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (!campaign) return null;

  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      `
      id, store_id, due_date, status,
      stores ( name ),
      submissions ( id, photos, ai_score, rejection_reason, created_at )
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
      aiScore: latest?.ai_score ?? null,
      rejectionReason: latest?.rejection_reason ?? null,
    };
  }

  const stores = [...storeMap.entries()]
    .map(([id2, name]) => ({ id: id2, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const cycles = [...cycleSet].sort();

  return { campaignName: campaign.name, stores, cycles, cells };
}
