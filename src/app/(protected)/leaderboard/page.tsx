import { requireAccess } from "@/core/auth/access";
import { createClient } from "@/core/db/server";
import { getStoreLeaderboard, getFieldUserLeaderboard } from "@/modules/leaderboard/queries";

export default async function LeaderboardPage() {
  const { profile: me } = await requireAccess("leaderboard");

  const supabase = await createClient();
  const { data: p } = await supabase
    .from("profiles")
    .select("job_title_id")
    .eq("id", me.id)
    .maybeSingle();

  const stores = me.is_admin ? await getStoreLeaderboard() : [];
  const users = await getFieldUserLeaderboard(me.is_admin ? null : (p?.job_title_id ?? null));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ranked by approval rate, then submission rate.
        </p>
      </div>

      {me.is_admin && (
        <section>
          <h2 className="text-sm font-semibold text-foreground">Stores</h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Store</th>
                  <th className="px-4 py-3 font-semibold">Submission %</th>
                  <th className="px-4 py-3 font-semibold">Approval rate</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s, i) => (
                  <tr key={s.name + i} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.submissionPct}%</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.approvalPct}%</td>
                  </tr>
                ))}
                {stores.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">No data yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-foreground">
          Field users{!me.is_admin && " (your group)"}
        </h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Job title</th>
                <th className="px-4 py-3 font-semibold">Submissions</th>
                <th className="px-4 py-3 font-semibold">Approval rate</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.name + i} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{u.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.jobTitle ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.submissions}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.approvalPct}%</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">No data yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
