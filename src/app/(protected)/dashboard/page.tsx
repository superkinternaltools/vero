import { getCurrentProfile } from "@/core/auth/session";
import { getAccess } from "@/core/auth/access";
import { createClient } from "@/core/db/server";
import { getCampaignHealthRows } from "@/modules/campaigns/stats";
import { HealthTableClient } from "@/modules/campaigns/components/health-table-client";

async function getKpis() {
  const supabase = await createClient();
  const [active, submissions, reviewsDone, reviewsPending] = await Promise.all([
    supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("status", "active").is("deleted_at", null),
    supabase.from("submissions").select("*", { count: "exact", head: true }),
    supabase.from("submissions").select("*", { count: "exact", head: true }).not("human_verdict", "is", null),
    supabase.from("submissions").select("*", { count: "exact", head: true }).eq("status", "pending_review"),
  ]);
  return {
    active: active.count ?? 0,
    submissions: submissions.count ?? 0,
    reviewsDone: reviewsDone.count ?? 0,
    reviewsPending: reviewsPending.count ?? 0,
  };
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const access = await getAccess();
  const showCampaigns = access?.allowed.includes("dashboard") ?? false;

  const [kpis, healthRows] = await Promise.all([
    getKpis(),
    showCampaigns ? getCampaignHealthRows() : Promise.resolve([]),
  ]);

  const cards = [
    { label: "Active Campaigns", value: kpis.active },
    { label: "Total Submissions", value: kpis.submissions },
    { label: "Manual Reviews Done", value: kpis.reviewsDone },
    { label: "Manual Reviews Pending", value: kpis.reviewsPending },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Welcome back, {profile?.display_name ?? "there"}.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{c.value}</p>
          </div>
        ))}
      </div>

      {showCampaigns && <HealthTableClient rows={healthRows} />}
    </div>
  );
}
