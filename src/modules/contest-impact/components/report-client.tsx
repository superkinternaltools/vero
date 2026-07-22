"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SelectSearch } from "@/core/ui/select-search";
import { cn } from "@/core/lib/utils";
import { GROUP_LABELS } from "../types";
import type { NameOption, WeekOption, ContestImpactReport, GroupKey, StoreDetailRow } from "../types";

const selectClass =
  "h-11 rounded-xl border border-transparent bg-input px-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none";

const GROUP_ORDER: GroupKey[] = ["approved", "configured_not_approved", "not_configured"];
const GROUP_STYLE: Record<GroupKey, { border: string; dot: string }> = {
  approved: { border: "border-t-success", dot: "bg-success" },
  configured_not_approved: { border: "border-t-warning", dot: "bg-warning" },
  not_configured: { border: "border-t-border", dot: "bg-muted-foreground" },
};
const GROUP_HINT: Record<GroupKey, string> = {
  approved: "Contest ran, execution verified",
  configured_not_approved: "Rejected · missed · no submission",
  not_configured: "Store not targeted this week",
};

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;
}
function pctColor(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-success" : "text-danger";
}
function barWidth(v: number | null, maxAbs: number): number {
  if (v == null) return 0;
  return Math.min(100, Math.max(4, (Math.abs(v) / (maxAbs || 1)) * 100));
}

function MetricRow({ label, lm, ly, maxAbs }: { label: string; lm: number | null; ly: number | null; maxAbs: number }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      {[
        { v: lm, tag: "LM", faded: false },
        { v: ly, tag: "LY", faded: true },
      ].map(({ v, tag, faded }) => (
        <div key={tag} className="flex items-center gap-2 py-0.5">
          <span className={cn("w-11 shrink-0 text-xs font-semibold tabular-nums", pctColor(v))}>{fmtPct(v)}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", v != null && v < 0 ? "bg-danger" : "bg-success", faded && "opacity-50")}
              style={{ width: `${barWidth(v, maxAbs)}%` }}
            />
          </div>
          <span className="w-6 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{tag}</span>
        </div>
      ))}
    </div>
  );
}

function maxAbsAcrossGroups(report: ContestImpactReport, pick: (g: ContestImpactReport["groups"][number]) => (number | null)[]): number {
  let max = 0;
  for (const g of report.groups) for (const v of pick(g)) if (v != null) max = Math.max(max, Math.abs(v));
  return max;
}

function DetailTable({ rows }: { rows: StoreDetailRow[] }) {
  if (!rows.length) return <p className="px-4 py-4 text-sm text-muted-foreground">No stores in this group.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 text-left font-semibold">Store</th>
            <th className="px-4 py-2 text-left font-semibold">MTD GMV</th>
            <th className="px-4 py-2 text-left font-semibold">vs LM</th>
            <th className="px-4 py-2 text-left font-semibold">vs LY</th>
            <th className="px-4 py-2 text-left font-semibold">Penetration</th>
            <th className="px-4 py-2 text-left font-semibold">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.storeId} className="border-b border-border last:border-0">
              <td className="px-4 py-2">{r.storeName}</td>
              <td className="px-4 py-2 tabular-nums">{r.gmv != null ? `₹${r.gmv.toLocaleString("en-IN")}` : "—"}</td>
              <td className={cn("px-4 py-2 tabular-nums", pctColor(r.gmvVsLastMonth))}>{fmtPct(r.gmvVsLastMonth)}</td>
              <td className={cn("px-4 py-2 tabular-nums", pctColor(r.gmvVsLastYear))}>{fmtPct(r.gmvVsLastYear)}</td>
              <td className="px-4 py-2 tabular-nums">{r.penetration != null ? `${(r.penetration * 100).toFixed(1)}%` : "—"}</td>
              <td className="px-4 py-2">{r.verdictLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportClient({
  campaigns,
  weeks,
  selectedCampaignId,
  selectedMonth,
  selectedWeek,
  report,
}: {
  campaigns: NameOption[];
  weeks: WeekOption[];
  selectedCampaignId: string | null;
  selectedMonth: string | null;
  selectedWeek: number | null;
  report: ContestImpactReport | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function navigate(next: { campaign?: string | null; month?: string | null; week?: number | null }) {
    const params = new URLSearchParams();
    const campaign = next.campaign !== undefined ? next.campaign : selectedCampaignId;
    const month = next.month !== undefined ? next.month : selectedMonth;
    const week = next.week !== undefined ? next.week : selectedWeek;
    if (campaign) params.set("campaign", campaign);
    if (month) params.set("month", month);
    if (week) params.set("week", String(week));
    startTransition(() => router.replace(`/contest-impact?${params.toString()}`, { scroll: false }));
  }

  const months = [...new Set(weeks.map((w) => w.month))].sort((a, b) => (a < b ? 1 : -1));
  const weeksInMonth = weeks.filter((w) => w.month === selectedMonth);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contest Impact</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compares stores by execution outcome for a given campaign week.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="w-64">
            <SelectSearch
              options={campaigns}
              value={selectedCampaignId}
              onChange={(id) => navigate({ campaign: id, month: null, week: null })}
              placeholder="Pick a campaign…"
              emptyText="No campaigns with imported data"
            />
          </div>
          <select
            className={selectClass}
            value={selectedMonth ?? ""}
            onChange={(e) => {
              const m = e.target.value || null;
              const firstWeek = weeks.find((w) => w.month === m)?.weekOfMonth ?? null;
              navigate({ month: m, week: firstWeek });
            }}
          >
            {months.length === 0 && <option value="">No data yet</option>}
            {months.map((m) => (
              <option key={m} value={m}>
                {new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={selectedWeek ?? ""}
            onChange={(e) => navigate({ week: e.target.value ? Number(e.target.value) : null })}
          >
            {weeksInMonth.length === 0 && <option value="">—</option>}
            {weeksInMonth.map((w) => (
              <option key={w.weekOfMonth} value={w.weekOfMonth}>
                Week {w.weekOfMonth}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!report && (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No imported performance data for this selection yet. Import a week&apos;s data first.
        </div>
      )}

      {report && (
        <>
          {report.excludedPendingCount > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              {report.excludedPendingCount} store{report.excludedPendingCount === 1 ? "" : "s"} excluded — their
              submission window for this week hasn&apos;t closed yet.
            </p>
          )}

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {report.groups.map((g) => {
              const style = GROUP_STYLE[g.key];
              return (
                <div key={g.key} className={cn("rounded-2xl border border-t-4 border-border bg-card p-4", style.border)}>
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", style.dot)} />
                    {GROUP_LABELS[g.key]}
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{g.count}</div>
                  <div className="text-xs text-muted-foreground">{GROUP_HINT[g.key]}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">
              GMV growth by group <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">median</span>
            </h3>
            <p className="mb-4 mt-1 text-xs text-muted-foreground">
              Median % change in MTD GMV across stores in each group, vs last month and vs last year same period.
            </p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {GROUP_ORDER.map((key) => {
                const g = report.groups.find((x) => x.key === key)!;
                const maxAbs = maxAbsAcrossGroups(report, (x) => [x.medianGmvVsLastMonth, x.medianGmvVsLastYear]);
                return (
                  <div key={key}>
                    <p className="mb-2 text-xs font-semibold text-foreground">{GROUP_LABELS[key]}</p>
                    <MetricRow label="" lm={g.medianGmvVsLastMonth} ly={g.medianGmvVsLastYear} maxAbs={maxAbs} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground">
              Supporting metrics <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">median</span>
            </h3>
            <p className="mb-3 mt-1 text-xs text-muted-foreground">Weighted equally with GMV, same vs-last-month / vs-last-year comparison.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Customer penetration growth", lm: "medianPenetrationVsLastMonth", ly: "medianPenetrationVsLastYear" } as const,
                { label: "Avg unit sold growth", lm: "medianAvgUnitVsLastMonth", ly: "medianAvgUnitVsLastYear" } as const,
                { label: "Category contribution growth", lm: "medianCategoryContributionVsLastMonth", ly: "medianCategoryContributionVsLastYear" } as const,
              ].map((metric) => {
                const maxAbs = maxAbsAcrossGroups(report, (x) => [x[metric.lm], x[metric.ly]]);
                return (
                  <div key={metric.label} className="rounded-2xl border border-border bg-card p-4">
                    <p className="mb-3 text-xs font-semibold text-foreground">{metric.label}</p>
                    <div className="space-y-3">
                      {GROUP_ORDER.map((key) => {
                        const g = report.groups.find((x) => x.key === key)!;
                        return (
                          <div key={key}>
                            <p className="mb-1 text-[11px] text-muted-foreground">{GROUP_LABELS[key]}</p>
                            <MetricRow label="" lm={g[metric.lm]} ly={g[metric.ly]} maxAbs={maxAbs} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-foreground">Store-level detail</h3>
            <p className="mb-3 mt-1 text-xs text-muted-foreground">
              Every group is listed, including stores with no contest at all, for context.
            </p>
            <div className="space-y-2">
              {GROUP_ORDER.map((key) => {
                const rows = report.detail[key];
                return (
                  <details key={key} className="overflow-hidden rounded-2xl border border-border bg-card">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-foreground">
                      {GROUP_LABELS[key]} · {rows.length} stores
                    </summary>
                    <div className="border-t border-border">
                      <DetailTable rows={rows} />
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
