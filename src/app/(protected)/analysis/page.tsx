import { requireAccess } from "@/core/auth/access";
import { getAnalytics } from "@/modules/analysis/queries";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function AnalysisPage() {
  await requireAccess("analysis");
  const a = await getAnalytics();
  const maxReason = a.rejectionReasons[0]?.count ?? 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Analysis</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Execution performance, AI quality, and payout — across all campaigns.
        </p>
      </div>

      {/* Funnel */}
      <section>
        <h2 className="text-sm font-semibold text-foreground">Funnel</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          <Stat label="Assigned" value={String(a.funnel.assigned)} />
          <Stat label="Submitted" value={String(a.funnel.submitted)} />
          <Stat label="AI-passed" value={String(a.funnel.aiPassed)} />
          <Stat label="Human-approved" value={String(a.funnel.humanApproved)} />
        </div>
      </section>

      {/* Rates */}
      <section>
        <h2 className="text-sm font-semibold text-foreground">Rates</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Submission %" value={`${a.rates.submission}%`} />
          <Stat label="Approval rate" value={`${a.rates.approval}%`} />
          <Stat label="Non-rejection %" value={`${a.rates.nonRejection}%`} />
          <Stat label="Rejection rate" value={`${a.rates.rejection}%`} />
          <Stat label="Missed rate" value={`${a.rates.missed}%`} />
          <Stat label="Re-upload rate" value={`${a.rates.reupload}%`} />
        </div>
      </section>

      {/* AI quality + payout */}
      <section>
        <h2 className="text-sm font-semibold text-foreground">AI quality &amp; payout</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="AI ↔ Human agreement"
            value={`${a.ai.agree + a.ai.disagree ? Math.round((a.ai.agree / (a.ai.agree + a.ai.disagree)) * 100) : 0}%`}
            sub={`${a.ai.agree} agree · ${a.ai.disagree} overridden`}
          />
          <Stat label="Override rate" value={`${a.ai.overrideRate}%`} />
          <Stat label="AI reliability" value={`${a.ai.total ? 100 - Math.round((a.ai.missing / a.ai.total) * 100) : 0}%`} sub={`${a.ai.missing}/${a.ai.total} missing a score`} />
          <Stat label="Payout committed" value={`₹${a.payoutCommitted.toLocaleString("en-IN")}`} />
        </div>
      </section>

      {/* Rejection reasons */}
      <section>
        <h2 className="text-sm font-semibold text-foreground">Top rejection reasons</h2>
        <div className="mt-3 rounded-2xl border border-border bg-card p-5">
          {a.rejectionReasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rejections yet.</p>
          ) : (
            <ul className="space-y-3">
              {a.rejectionReasons.map((r) => (
                <li key={r.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{r.name}</span>
                    <span className="text-muted-foreground">{r.count}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(r.count / maxReason) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Filters, integrity-flag rates (geofence/duplicate), and Excel/PDF export will layer on next.
      </p>
    </div>
  );
}
