import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/core/auth/access";
import { getCampaignDeepStats } from "@/modules/campaigns/stats";
import { HealthBadge } from "@/modules/campaigns/components/health-badge";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export default async function CampaignDeepViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAccess("campaigns");
  const { id } = await params;
  const s = await getCampaignDeepStats(id);
  if (!s) notFound();

  const worst = s.stores.slice(0, 5).filter((x) => x.submissionPct < 100);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{s.name}</h1>
            <HealthBadge health={s.health} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {s.executionTypeName ?? "—"} · {s.frequency} · {s.status}
            {s.startDate && s.endDate && ` · ${s.startDate} → ${s.endDate}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/campaigns/${s.id}/edit`}>
            <Button variant="outline" size="md">Edit campaign</Button>
          </Link>
          <Link href={`/summary?campaign=${s.id}`}>
            <Button variant="outline" size="md">Open summary</Button>
          </Link>
          <Link href="/review">
            <Button size="md">Review queue</Button>
          </Link>
        </div>
      </div>

      {/* What's wrong & who to chase */}
      {(s.health === "critical" || s.health === "needs_attention") && (
        <div
          className={cn(
            "rounded-2xl border p-5",
            s.health === "critical"
              ? "border-danger/30 bg-danger/5"
              : "border-warning/30 bg-warning/5",
          )}
        >
          <p className="text-sm font-semibold text-foreground">What&apos;s wrong</p>
          <p className="mt-1 text-sm text-muted-foreground">{s.healthReason}</p>
          {worst.length > 0 && (
            <>
              <p className="mt-3 text-sm font-semibold text-foreground">Who to chase</p>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {worst.map((w) => (
                  <li key={w.storeName}>
                    <span className="font-medium text-foreground">{w.storeName}</span> — {w.submissionPct}% submitted
                    ({w.submitted}/{w.assigned})
                  </li>
                ))}
              </ul>
            </>
          )}
          {s.topRejectionReasons[0] && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Top rejection reason:</span>{" "}
              {s.topRejectionReasons[0].name} ({s.topRejectionReasons[0].count}×)
            </p>
          )}
        </div>
      )}

      <section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Submission %" value={`${s.submissionPct}%`} />
          <Stat label="Approval rate" value={`${s.approvalPct}%`} />
          <Stat label="Non-Rejection %" value={`${s.nonRejectionPct}%`} />
          <Stat label="Missed / not done" value={`${s.missedPct}%`} />
          <Stat label="Payout committed" value={`₹${s.payoutCommitted.toLocaleString("en-IN")}`} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Store breakdown (worst first)</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Store</th>
                <th className="px-4 py-3 font-semibold">Assigned</th>
                <th className="px-4 py-3 font-semibold">Submitted</th>
                <th className="px-4 py-3 font-semibold">Approved</th>
                <th className="px-4 py-3 font-semibold">Submission %</th>
              </tr>
            </thead>
            <tbody>
              {s.stores.map((r) => (
                <tr key={r.storeName} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{r.storeName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.assigned}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.submitted}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.approved}</td>
                  <td
                    className={cn(
                      "px-4 py-3 font-medium",
                      r.submissionPct >= 80
                        ? "text-success"
                        : r.submissionPct >= 50
                          ? "text-warning"
                          : "text-danger",
                    )}
                  >
                    {r.submissionPct}%
                  </td>
                </tr>
              ))}
              {s.stores.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                    No tasks generated for this campaign yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {s.topRejectionReasons.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground">Top rejection reasons</h2>
          <div className="mt-3 rounded-2xl border border-border bg-card p-5">
            <ul className="space-y-2">
              {s.topRejectionReasons.map((r) => (
                <li key={r.name} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{r.name}</span>
                  <span className="text-muted-foreground">{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
