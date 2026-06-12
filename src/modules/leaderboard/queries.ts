import { createClient } from "@/core/db/server";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type StoreRank = {
  name: string;
  assigned: number;
  submissionPct: number;
  approvalPct: number;
};
export type UserRank = {
  name: string;
  jobTitle: string | null;
  submissions: number;
  approvalPct: number;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export async function getStoreLeaderboard(): Promise<StoreRank[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select("store_id, status, stores ( name )");
  const map = new Map<string, { name: string; assigned: number; submitted: number; approved: number }>();
  for (const t of (data as any[]) ?? []) {
    const m = map.get(t.store_id) ?? { name: t.stores?.name ?? "—", assigned: 0, submitted: 0, approved: 0 };
    m.assigned += 1;
    if (["submitted", "approved", "rejected"].includes(t.status)) m.submitted += 1;
    if (t.status === "approved") m.approved += 1;
    map.set(t.store_id, m);
  }
  return [...map.values()]
    .map((m) => ({
      name: m.name,
      assigned: m.assigned,
      submissionPct: pct(m.submitted, m.assigned),
      approvalPct: pct(m.approved, m.submitted),
    }))
    .sort((a, b) => b.approvalPct - a.approvalPct || b.submissionPct - a.submissionPct);
}

export async function getFieldUserLeaderboard(jobTitleId: string | null): Promise<UserRank[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("submissions")
    .select("submitted_by, status, profiles ( display_name, job_title_id, job_titles ( name ) )");

  const map = new Map<string, { name: string; jobTitle: string | null; jobTitleId: string | null; total: number; approved: number }>();
  for (const s of (data as any[]) ?? []) {
    if (!s.submitted_by) continue;
    const m =
      map.get(s.submitted_by) ?? {
        name: s.profiles?.display_name ?? "—",
        jobTitle: s.profiles?.job_titles?.name ?? null,
        jobTitleId: s.profiles?.job_title_id ?? null,
        total: 0,
        approved: 0,
      };
    m.total += 1;
    if (s.status === "approved") m.approved += 1;
    map.set(s.submitted_by, m);
  }

  return [...map.values()]
    .filter((m) => !jobTitleId || m.jobTitleId === jobTitleId)
    .map((m) => ({
      name: m.name,
      jobTitle: m.jobTitle,
      submissions: m.total,
      approvalPct: pct(m.approved, m.total),
    }))
    .sort((a, b) => b.approvalPct - a.approvalPct || b.submissions - a.submissions);
}
