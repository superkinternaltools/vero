import Link from "next/link";
import { getCurrentProfile } from "@/core/auth/session";
import { getAccess } from "@/core/auth/access";
import { createClient } from "@/core/db/server";
import { getCampaignHealthRows } from "@/modules/campaigns/stats";
import { HealthBadge } from "@/modules/campaigns/components/health-badge";

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
  const showCampaigns = access?.allowed.includes("campaigns") ?? false;

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

      {showCampaigns && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-foreground">Campaign health</h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Campaign</th>
                  <th className="px-4 py-3 font-semibold">Execution</th>
                  <th className="px-4 py-3 font-semibold">Submission %</th>
                  <th className="px-4 py-3 font-semibold">Non-Rejection %</th>
                  <th className="px-4 py-3 font-semibold">Payout (₹)</th>
                  <th className="px-4 py-3 font-semibold">Health</th>
                </tr>
              </thead>
              <tbody>
                {healthRows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/campaigns/${r.id}`} className="text-foreground hover:text-primary">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.executionTypeName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.submissionPct}%</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.nonRejectionPct}%</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      ₹{r.payoutCommitted.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/campaigns/${r.id}`}>
                        <HealthBadge health={r.health} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {healthRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                      No campaigns yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Click a campaign or its health badge for the deeper view.</p>
        </section>
      )}
    </div>
  );
}
