import { getCurrentProfile } from "@/core/auth/session";
import { getAccess } from "@/core/auth/access";
import { createClient } from "@/core/db/server";
import { getCampaignHealthRows, resolveWindow, type WeekSel } from "@/modules/campaigns/stats";
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  const access = await getAccess();
  const showCampaigns = access?.allowed.includes("dashboard") ?? false;

  // "Now" snapshot — drives current-month/week defaults + future-week guards.
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1; // 1-indexed
  const day = now.getDate();
  const nowWeekNum = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;

  // Resolve the selected month from the URL (defaults to current month).
  let selYear = nowYear;
  let selMonth = nowMonth;
  if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
    const [y, m] = sp.month.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      selYear = y;
      selMonth = m;
    }
  }
  const isCurrentMonth = selYear === nowYear && selMonth === nowMonth;

  // Resolve the selected week (defaults: current week for this month, else "all").
  const WEEK_VALUES: WeekSel[] = ["all", "w1", "w2", "w3", "w4"];
  let selWeek: WeekSel = isCurrentMonth ? (`w${nowWeekNum}` as WeekSel) : "all";
  if (sp.week && WEEK_VALUES.includes(sp.week as WeekSel)) {
    selWeek = sp.week as WeekSel;
  }
  // Never allow a future week of the current month.
  if (isCurrentMonth && selWeek !== "all" && parseInt(selWeek[1]) > nowWeekNum) {
    selWeek = `w${nowWeekNum}` as WeekSel;
  }

  const window = resolveWindow(selYear, selMonth, selWeek);

  const [kpis, healthRows] = await Promise.all([
    getKpis(),
    showCampaigns ? getCampaignHealthRows(window) : Promise.resolve([]),
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
        <HealthTableClient
          rows={healthRows}
          selYear={selYear}
          selMonth={selMonth}
          selWeek={selWeek}
          nowYear={nowYear}
          nowMonth={nowMonth}
          nowWeekNum={nowWeekNum}
        />
      )}
    </div>
  );
}
