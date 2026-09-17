"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SelectSearch } from "@/core/ui/select-search";
import { Modal } from "@/core/ui/modal";
import { cn } from "@/core/lib/utils";
import type { CampaignEarnings, StoreEarningsSummary, StoreOption, SubmissionDetail } from "../types";

function fmtINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function fmtMonthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

const selectClass =
  "h-11 rounded-xl border border-transparent bg-input px-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none";

export function StoreEarningsClient({
  stores,
  storeId,
  month,
  summary,
}: {
  stores: StoreOption[];
  storeId: string | null;
  month: string;
  summary: StoreEarningsSummary | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeCampaign, setActiveCampaign] = useState<CampaignEarnings | null>(null);

  function navigate(next: { store?: string | null; month?: string | null }) {
    const params = new URLSearchParams();
    const s = next.store !== undefined ? next.store : storeId;
    const m = next.month !== undefined ? next.month : month;
    if (s) params.set("store", s);
    if (m) params.set("month", m);
    startTransition(() => router.push(`/store-earnings?${params.toString()}`));
  }

  const storeOptions = stores.map((s) => ({ id: s.id, label: s.name }));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Store Earnings</h1>
          <p className="mt-1 text-sm text-muted-foreground">What this store has earned from running campaigns.</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => navigate({ month: e.target.value || null })}
          className={selectClass}
        />
      </div>

      <div className="mt-5 flex items-center gap-2">
        {stores.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stores are assigned to you yet.</p>
        ) : stores.length === 1 ? (
          <span className="text-base font-semibold text-foreground">{stores[0].name}</span>
        ) : (
          <div className="w-64">
            <SelectSearch
              options={storeOptions}
              value={storeId}
              onChange={(id) => navigate({ store: id })}
              placeholder="Pick a store…"
            />
          </div>
        )}
      </div>

      {!summary && stores.length > 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No campaign activity found for this store in {fmtMonthLabel(month)}.
        </div>
      )}

      {summary && <SummaryView summary={summary} onOpenCampaign={setActiveCampaign} />}

      {activeCampaign && (
        <CampaignModal storeName={summary?.storeName ?? ""} campaign={activeCampaign} onClose={() => setActiveCampaign(null)} />
      )}
    </div>
  );
}

function SummaryView({ summary, onOpenCampaign }: { summary: StoreEarningsSummary; onOpenCampaign: (c: CampaignEarnings) => void }) {
  const growth = summary.lastMonthTotal > 0 ? ((summary.total - summary.lastMonthTotal) / summary.lastMonthTotal) * 100 : null;
  const top = summary.campaigns[0] ?? null;
  const flagged = summary.campaigns.filter((c) => c.weeks.some((w) => w.submissions.some((s) => s.verdict === "rejected"))).length;
  const unscored = summary.campaigns.filter(
    (c) => !c.weeks.some((w) => w.submissions.some((s) => s.verdict === "rejected")) && c.weeks.some((w) => w.submissions.some((s) => s.verdict === "unscored")),
  ).length;
  const clean = summary.campaigns.length - flagged - unscored;
  const maxWeek = Math.max(1, ...summary.weeklyTotals);

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earned this month</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{fmtINR(summary.total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {growth == null ? (
              "No data last month to compare"
            ) : (
              <>
                <span className={cn("font-medium", growth >= 0 ? "text-success" : "text-danger")}>
                  {growth >= 0 ? "+" : ""}
                  {growth.toFixed(1)}%
                </span>{" "}
                vs {fmtINR(summary.lastMonthTotal)} last month
              </>
            )}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaigns running</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{summary.campaigns.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {clean} fully approved, {flagged} with a rejected week, {unscored} still awaiting review
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top earner</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{top ? fmtINR(top.total) : "—"}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{top?.name ?? "No campaigns this month"}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">This month, week by week</h3>
        <p className="mt-1 text-xs text-muted-foreground">Total earned across every campaign at this store, per week.</p>
        <div className="mt-4 flex items-end gap-2.5" style={{ height: 90 }}>
          {summary.weeklyTotals.map((amt, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[11px] font-semibold tabular-nums text-foreground">{fmtINR(amt)}</span>
              <div
                className="w-full max-w-11 rounded-t-md rounded-b-sm bg-primary"
                style={{ height: `${Math.max(4, (amt / maxWeek) * 100)}%` }}
              />
              <span className="text-[10.5px] text-muted-foreground">Week {i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="p-5 pb-3">
          <h3 className="text-sm font-semibold text-foreground">Earnings by campaign</h3>
          <p className="mt-1 text-xs text-muted-foreground">Click a campaign to see exactly which weeks were approved or rejected, and why.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-t border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 text-left font-semibold">Campaign</th>
              <th className="px-5 py-2.5 text-left font-semibold">Payout model</th>
              <th className="px-5 py-2.5 text-left font-semibold">Status this month</th>
              <th className="px-5 py-2.5 text-right font-semibold">Earned</th>
              <th className="px-5 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {summary.campaigns.map((c) => (
              <CampaignRow key={c.campaignId} campaign={c} onClick={() => onOpenCampaign(c)} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-card p-3.5 text-xs text-muted-foreground">
        <span>ⓘ</span>
        <span>
          Only <b className="text-foreground">approved</b> weeks are paid. A rejected or still-unscored week shows exactly why it isn&apos;t
          counted yet — open any campaign to see the reason.
        </span>
      </div>
    </div>
  );
}

function campaignStatus(c: CampaignEarnings): { cls: string; text: string } {
  const all = c.weeks.flatMap((w) => w.submissions);
  const n = all.length;
  const approved = all.filter((s) => s.verdict === "approved").length;
  const rejected = all.filter((s) => s.verdict === "rejected").length;
  const unscored = all.filter((s) => s.verdict === "unscored").length;
  if (n === 0) return { cls: "bg-input text-muted-foreground", text: "No activity" };
  if (rejected > 0) return { cls: "bg-warning/10 text-warning", text: `${approved} of ${n} approved, ${rejected} rejected` };
  if (unscored > 0) return { cls: "bg-warning/10 text-warning", text: `${approved} of ${n} approved, ${unscored} awaiting review` };
  return { cls: "bg-success/10 text-success", text: `${approved} of ${n} approved` };
}

function CampaignRow({ campaign, onClick }: { campaign: CampaignEarnings; onClick: () => void }) {
  const st = campaignStatus(campaign);
  return (
    <tr onClick={onClick} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40">
      <td className="px-5 py-3.5">
        <p className="font-medium text-foreground">{campaign.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{fmtINR(campaign.payoutAmount)} {campaign.payoutModel === "tiered" ? "base · tier sets the %" : "per approved week"}</p>
      </td>
      <td className="px-5 py-3.5">
        <span className="rounded-full bg-input px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">{campaign.payoutModel}</span>
      </td>
      <td className="px-5 py-3.5">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", st.cls)}>{st.text}</span>
      </td>
      <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-foreground">{fmtINR(campaign.total)}</td>
      <td className="px-5 py-3.5 text-right text-muted-foreground">›</td>
    </tr>
  );
}

const VERDICT_STYLE: Record<string, { cls: string; label: string }> = {
  approved: { cls: "bg-success/10 text-success", label: "Approved" },
  rejected: { cls: "bg-danger/10 text-danger", label: "Rejected" },
  unscored: { cls: "bg-input text-muted-foreground", label: "Not submitted yet" },
};

function CampaignModal({ storeName, campaign, onClose }: { storeName: string; campaign: CampaignEarnings; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={campaign.name} size="lg">
      <p className="-mt-3 mb-4 text-xs text-muted-foreground">
        {storeName} · {campaign.payoutModel === "tiered" ? "Tiered" : "Binary"} ·{" "}
        {fmtINR(campaign.payoutAmount)} {campaign.payoutModel === "tiered" ? "base, tier sets the %" : "per approved week"}
      </p>
      <div className="max-h-[60vh] space-y-1 overflow-y-auto">
        {campaign.weeks.map((w) => (
          <div key={w.week} className="border-b border-border py-3 last:border-0">
            {w.submissions.length === 0 ? (
              <div className="flex items-center gap-3">
                <WeekBadge n={w.week} />
                <p className="text-sm text-muted-foreground">No task this week</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {w.submissions.map((s, i) => (
                  <SubmissionRow key={i} week={w.week} showWeek={i === 0} submission={s} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-input px-4 py-3">
        <span className="text-xs font-medium text-muted-foreground">Total earned this month</span>
        <span className="text-lg font-bold tabular-nums text-foreground">{fmtINR(campaign.total)}</span>
      </div>
    </Modal>
  );
}

function WeekBadge({ n }: { n: number }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-input text-xs font-bold text-foreground">
      W{n}
    </span>
  );
}

function SubmissionRow({ week, showWeek, submission }: { week: number; showWeek: boolean; submission: SubmissionDetail }) {
  const style = VERDICT_STYLE[submission.verdict];
  return (
    <div className="flex gap-3">
      {showWeek ? <WeekBadge n={week} /> : <div className="w-8 shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", style.cls)}>{style.label}</span>
          <span className={cn("text-sm font-semibold tabular-nums", submission.amount === 0 ? "text-muted-foreground" : "text-foreground")}>
            {fmtINR(submission.amount)}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {submission.tierLabel && (
            <>
              Tier: <b className="font-medium text-foreground">{submission.tierLabel}</b>
              {submission.aiScore != null && " · "}
            </>
          )}
          {submission.aiScore != null && `AI score ${submission.aiScore}/10`}
          {submission.verdict !== "unscored" && !submission.humanReviewed && " · awaiting human review"}
          {submission.verdict === "rejected" && submission.rejectionReason && (
            <>
              {" "}
              — <b className="font-medium text-danger">{submission.rejectionReason}</b>
            </>
          )}
          {submission.verdict === "unscored" && "No submission on record for this day yet"}
        </p>
      </div>
    </div>
  );
}
