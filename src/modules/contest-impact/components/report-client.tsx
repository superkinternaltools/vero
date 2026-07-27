"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SelectSearch } from "@/core/ui/select-search";
import { cn } from "@/core/lib/utils";
import { GROUP_LABELS, GROUP_ORDER } from "../types";
import type {
  CampaignOption,
  GroupKey,
  MonthlyOverview,
  WeekReport,
  WeekTrendPoint,
  WeekMetrics,
  StoreDetailRow,
} from "../types";

type TrendMetricKey = keyof WeekTrendPoint["byGroup"][GroupKey];

const SELL_METRICS: { key: string; label: string; lm: keyof WeekMetrics; ly: keyof WeekMetrics }[] = [
  { key: "gmv", label: "GMV growth", lm: "gmvVsLastMonth", ly: "gmvVsLastYear" },
  { key: "penetration", label: "Customer penetration growth", lm: "penetrationVsLastMonth", ly: "penetrationVsLastYear" },
  { key: "avgUnit", label: "Avg unit sold growth", lm: "avgUnitVsLastMonth", ly: "avgUnitVsLastYear" },
  {
    key: "categoryContribution",
    label: "Category contribution growth",
    lm: "categoryContributionVsLastMonth",
    ly: "categoryContributionVsLastYear",
  },
];

const selectClass =
  "h-11 rounded-xl border border-transparent bg-input px-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none";

const GROUP_STYLE: Record<GroupKey, { border: string; dot: string; text: string }> = {
  approved: { border: "border-t-success", dot: "bg-success", text: "text-success" },
  configured_not_approved: { border: "border-t-warning", dot: "bg-warning", text: "text-warning" },
  not_configured: { border: "border-t-border", dot: "bg-muted-foreground", text: "text-muted-foreground" },
};
const GROUP_HINT: Record<GroupKey, string> = {
  approved: "Status = Approved or Half Approved",
  configured_not_approved: "Status = Rejected or Pending",
  not_configured: "No row in Campaign Data this week",
};

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;
}
function fmtLevel(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(0)}%`;
}
function pctColor(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-success" : "text-danger";
}
function barWidth(v: number | null, maxAbs: number): number {
  if (v == null) return 0;
  return Math.min(100, Math.max(4, (Math.abs(v) / (maxAbs || 1)) * 100));
}

function MetricRow({ lm, ly, maxAbs }: { lm: number | null; ly: number | null; maxAbs: number }) {
  return (
    <div>
      {[{ v: lm, tag: "LM", faded: false }, { v: ly, tag: "LY", faded: true }].map(({ v, tag, faded }) => (
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

function LevelBar({ value, color }: { value: number | null; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("w-10 shrink-0 text-xs font-semibold tabular-nums", color)}>{fmtLevel(value)}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", color.replace("text-", "bg-"))} style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} />
      </div>
    </div>
  );
}

function DetailTable({ rows }: { rows: StoreDetailRow[] }) {
  if (!rows.length) return <p className="px-4 py-4 text-sm text-muted-foreground">No stores in this group.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 text-left font-semibold">Store</th>
            <th className="px-4 py-2 text-left font-semibold">Status</th>
            <th className="px-4 py-2 text-left font-semibold">GMV</th>
            <th className="px-4 py-2 text-left font-semibold">vs LM</th>
            <th className="px-4 py-2 text-left font-semibold">vs LY</th>
            <th className="px-4 py-2 text-left font-semibold">Store fill</th>
            <th className="px-4 py-2 text-left font-semibold">Warehouse fill</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.storeId} className="border-b border-border last:border-0">
              <td className="px-4 py-2">{r.storeName}</td>
              <td className="px-4 py-2">{r.status ?? "No contest"}</td>
              <td className="px-4 py-2 tabular-nums">{r.gmv != null ? `₹${r.gmv.toLocaleString("en-IN")}` : "—"}</td>
              <td className={cn("px-4 py-2 tabular-nums", pctColor(r.gmvVsLastMonth))}>{fmtPct(r.gmvVsLastMonth)}</td>
              <td className={cn("px-4 py-2 tabular-nums", pctColor(r.gmvVsLastYear))}>{fmtPct(r.gmvVsLastYear)}</td>
              <td className="px-4 py-2 tabular-nums">{fmtLevel(r.storeStockFillRate)}</td>
              <td className="px-4 py-2 tabular-nums">{fmtLevel(r.warehouseStockFillRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- trend chart geometry ----
const CHART_W = 280;
const CHART_H = 90;
const PAD_X = 16;
const PAD_Y = 14;

function scaleAll(series: (number | null)[][]): { min: number; max: number } {
  const all = series.flat().filter((v): v is number => v != null);
  if (!all.length) return { min: 0, max: 1 };
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return { min, max };
}

function toPoints(values: (number | null)[], min: number, max: number): { x: number; y: number }[] {
  const n = values.length;
  const stepX = n > 1 ? (CHART_W - PAD_X * 2) / (n - 1) : 0;
  const range = max - min || 1;
  const pts: { x: number; y: number }[] = [];
  values.forEach((v, i) => {
    if (v == null) return;
    const x = PAD_X + i * stepX;
    const y = CHART_H - PAD_Y - ((v - min) / range) * (CHART_H - PAD_Y * 2);
    pts.push({ x, y });
  });
  return pts;
}

type TrendMetric = { key: TrendMetricKey; label: string; source: "sell" | "inv"; signed: boolean };
const TREND_METRICS: TrendMetric[] = [
  { key: "gmvVsLastMonth", label: "GMV growth", source: "sell", signed: true },
  { key: "penetrationVsLastMonth", label: "Customer penetration growth", source: "sell", signed: true },
  { key: "avgUnitVsLastMonth", label: "Avg unit sold growth", source: "sell", signed: true },
  { key: "categoryContributionVsLastMonth", label: "Category contribution growth", source: "sell", signed: true },
  { key: "storeStockFillRate", label: "Store stock fill rate", source: "inv", signed: false },
  { key: "warehouseStockFillRate", label: "Warehouse stock fill rate", source: "inv", signed: false },
];

function MiniTrend({ metric, overview }: { metric: TrendMetric; overview: MonthlyOverview }) {
  const seriesByGroup: Record<GroupKey, (number | null)[]> = {
    approved: overview.weeks.map((w) => w.byGroup.approved[metric.key] ?? null),
    configured_not_approved: overview.weeks.map((w) => w.byGroup.configured_not_approved[metric.key] ?? null),
    not_configured: overview.weeks.map((w) => w.byGroup.not_configured[metric.key] ?? null),
  };
  const { min, max } = scaleAll(Object.values(seriesByGroup));
  const colorFor: Record<GroupKey, string> = { approved: "var(--color-success)", configured_not_approved: "var(--color-warning)", not_configured: "var(--color-muted-foreground)" };

  const approvedSeries = seriesByGroup.approved.filter((v): v is number => v != null);
  const first = approvedSeries[0];
  const last = approvedSeries[approvedSeries.length - 1];
  const fmt = (v: number) => (metric.signed ? `${v > 0 ? "+" : ""}${v.toFixed(0)}%` : `${v.toFixed(0)}%`);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", metric.source === "sell" ? "bg-primary" : "bg-purple-500")} />
        {metric.label}
      </h4>
      <p className="mb-1.5 mt-0.5 text-[11px] text-muted-foreground">
        {first != null && last != null ? (
          <>Approved <b className="text-success tabular-nums">{fmt(first)} → {fmt(last)}</b></>
        ) : (
          "Not enough weeks yet"
        )}
      </p>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-auto w-full">
        {GROUP_ORDER.map((key) => {
          const pts = toPoints(seriesByGroup[key], min, max);
          if (!pts.length) return null;
          return (
            <g key={key}>
              <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={colorFor[key]} strokeWidth={2} />
              <circle cx={pts[0].x} cy={pts[0].y} r={3} fill={colorFor[key]} />
              <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3} fill={colorFor[key]} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ReportClient({
  campaigns,
  months,
  campaignKey,
  month,
  week,
  overview,
  weekReport,
}: {
  campaigns: CampaignOption[];
  months: string[];
  campaignKey: string | null;
  month: string | null;
  week: number | null;
  overview: MonthlyOverview | null;
  weekReport: WeekReport | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function navigate(next: { campaign?: string | null; month?: string | null; week?: number | null }) {
    const params = new URLSearchParams();
    const campaign = next.campaign !== undefined ? next.campaign : campaignKey;
    const m = next.month !== undefined ? next.month : month;
    const w = next.week !== undefined ? next.week : week;
    if (campaign) params.set("campaign", campaign);
    if (m) params.set("month", m);
    if (w) params.set("week", String(w));
    startTransition(() => router.replace(`/contest-impact?${params.toString()}`, { scroll: false }));
  }

  const campaignOptions = campaigns.map((c) => ({ id: c.key, label: c.label }));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contest Impact</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {week
              ? "Single-week detail — store-by-store, all three data sources combined."
              : "See the whole month at a glance, then dive into any week for full store-level detail."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="w-64">
            <SelectSearch
              options={campaignOptions}
              value={campaignKey}
              onChange={(key) => navigate({ campaign: key, month: null, week: null })}
              placeholder="Pick a campaign…"
              emptyText="No campaign data uploaded yet"
            />
          </div>
          <select
            className={selectClass}
            value={month ?? ""}
            onChange={(e) => navigate({ month: e.target.value || null, week: null })}
          >
            {months.length === 0 && <option value="">No data yet</option>}
            {months.map((m) => (
              <option key={m} value={m}>
                {new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {week && (
        <button
          type="button"
          onClick={() => navigate({ week: null })}
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          ← Back to month
        </button>
      )}

      {!overview && (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No contest data yet for this selection. Import a sheet first.
        </div>
      )}

      {overview && !week && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-foreground">Every metric, week over week</p>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Median per group, one line per week. Blue dot = sell-through, purple dot = inventory compliance.
          </p>
          <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />Approved</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" />Configured, not approved</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted-foreground" />Not configured</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TREND_METRICS.map((m) => (
              <MiniTrend key={m.key} metric={m} overview={overview} />
            ))}
          </div>

          <p className="mb-3 mt-6 text-sm font-semibold text-foreground">Week by week</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {overview.weeks.map((w) => {
              const total = w.counts.approved + w.counts.configured_not_approved + w.counts.not_configured || 1;
              return (
                <div key={w.week} className="rounded-xl border border-border bg-card p-4">
                  <p className="mb-2 text-sm font-semibold text-foreground">Week {w.week}</p>
                  <div className="mb-2 flex h-2 overflow-hidden rounded-full">
                    <div className="h-full bg-success" style={{ width: `${(w.counts.approved / total) * 100}%` }} />
                    <div className="h-full bg-warning" style={{ width: `${(w.counts.configured_not_approved / total) * 100}%` }} />
                    <div className="h-full bg-muted-foreground" style={{ width: `${(w.counts.not_configured / total) * 100}%` }} />
                  </div>
                  <div className="mb-3 flex justify-between text-[11px] text-muted-foreground">
                    <span>{w.counts.approved} appr.</span>
                    <span>{w.counts.configured_not_approved} conf.</span>
                    <span>{w.counts.not_configured} none</span>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Approved GMV <b className={cn("tabular-nums", pctColor(w.byGroup.approved.gmvVsLastMonth))}>{fmtPct(w.byGroup.approved.gmvVsLastMonth)}</b> vs LM
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate({ week: w.week })}
                    className="w-full rounded-lg border border-primary py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                  >
                    View week →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {weekReport && week && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {weekReport.groups.map((g) => {
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
            <h3 className="text-sm font-semibold text-foreground">Sell-through impact</h3>
            <p className="mb-4 mt-1 text-xs text-muted-foreground">Median % change vs last month / last year, by group.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {SELL_METRICS.map((metric) => {
                const maxAbs = Math.max(
                  ...weekReport.groups
                    .flatMap((g) => [g.metrics[metric.lm], g.metrics[metric.ly]])
                    .filter((v): v is number => v != null)
                    .map((v) => Math.abs(v)),
                  1,
                );
                return (
                  <div
                    key={metric.key}
                    className="rounded-xl border border-border bg-card p-3 sm:col-span-1 sm:row-span-1"
                    style={{ gridColumn: metric.key === "gmv" ? "1 / -1" : undefined }}
                  >
                    <p className="mb-2 text-xs font-semibold text-foreground">{metric.label}</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {GROUP_ORDER.map((key) => {
                        const g = weekReport.groups.find((x) => x.key === key)!;
                        return (
                          <div key={key}>
                            <p className="mb-1 text-[11px] text-muted-foreground">{GROUP_LABELS[key]}</p>
                            <MetricRow lm={g.metrics[metric.lm]} ly={g.metrics[metric.ly]} maxAbs={maxAbs} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Inventory compliance</h3>
            <p className="mb-4 mt-1 text-xs text-muted-foreground">
              Median per group. Weighted fill rate = stock on hand ÷ target across every SKU. SKUs on target = share of SKUs individually hitting target.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {GROUP_ORDER.map((key) => {
                const g = weekReport.groups.find((x) => x.key === key)!;
                const style = GROUP_STYLE[key];
                return (
                  <div key={key} className="rounded-xl border border-border bg-card p-3">
                    <p className="mb-2 text-xs font-semibold text-foreground">{GROUP_LABELS[key]}</p>
                    <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Store stock</p>
                    <div className="mb-1"><LevelBar value={g.metrics.storeStockFillRate} color={style.text} /></div>
                    <p className="mb-3 text-[10px] text-muted-foreground">weighted fill · {fmtLevel(g.metrics.storeSkuOnTargetPct)} SKUs on target</p>
                    <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Warehouse stock</p>
                    <div className="mb-1"><LevelBar value={g.metrics.warehouseStockFillRate} color={style.text} /></div>
                    <p className="text-[10px] text-muted-foreground">weighted fill · {fmtLevel(g.metrics.warehouseSkuOnTargetPct)} SKUs on target</p>
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
                const rows = weekReport.detail[key];
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
