"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { SelectSearch } from "@/core/ui/select-search";
import { cn } from "@/core/lib/utils";
import { SELL_METRICS, GROUP_LABELS } from "../types";
import type {
  CampaignOption,
  ComparisonBasis,
  ContestGroup,
  ContestMonthReport,
  GroupValues,
  MetricKind,
  MetricSeries,
  StoreRow,
} from "../types";

const selectClass =
  "h-11 rounded-xl border border-transparent bg-input px-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none";

const GROUP_COLOR: Record<ContestGroup, string> = {
  approved: "var(--color-success)",
  poor: "var(--color-danger)",
  control: "var(--color-muted-foreground)",
};

// ==================== formatting ====================

function fmtINR(v: number | null): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}k`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}
function fmtNum(v: number | null, decimals = 1): string {
  return v == null ? "—" : v.toFixed(decimals);
}
function fmtPercent(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}
function fmtHard(v: number | null, kind: MetricKind): string {
  if (kind === "currency") return fmtINR(v);
  if (kind === "percent") return fmtPercent(v);
  return fmtNum(v);
}
function fmtGrowth(v: number | null, kind: MetricKind): string {
  if (v == null) return "no data";
  const rounded = Math.round(v * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return kind === "percent" ? `${sign}${rounded.toFixed(1)}pp` : `${sign}${rounded.toFixed(1)}%`;
}
function pctColor(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted-foreground";
}
function fmtMonthLabel(basis: ComparisonBasis): string {
  return basis === "lastMonth" ? "vs last month" : "vs last year";
}

// ==================== comparison toggle ====================

function ComparisonToggle({ basis, onChange }: { basis: ComparisonBasis; onChange: (b: ComparisonBasis) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground">Compare against:</label>
      <div className="flex gap-1 rounded-lg bg-input p-1">
        {(["lastMonth", "lastYear"] as ComparisonBasis[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => onChange(b)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              basis === b ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {b === "lastMonth" ? "Last month" : "Last year"}
          </button>
        ))}
      </div>
    </div>
  );
}

function GroupLegend({ groups = ["approved", "poor", "control"] as ContestGroup[] }: { groups?: ContestGroup[] }) {
  return (
    <div className="flex flex-wrap gap-4">
      {groups.map((g) => (
        <div key={g} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: GROUP_COLOR[g] }} />
          {GROUP_LABELS[g]}
        </div>
      ))}
    </div>
  );
}

// ==================== weekly chart (hover reveals growth) ====================

type Hover = { group: ContestGroup; week: number } | null;

function WeeklyChart({
  metric,
  basis,
  groups = ["approved", "poor", "control"] as ContestGroup[],
  height = 260,
}: {
  metric: MetricSeries;
  basis: ComparisonBasis;
  groups?: ContestGroup[];
  height?: number;
}) {
  const [hover, setHover] = useState<Hover>(null);
  const meta = SELL_METRICS.find((m) => m.key === metric.key)!;
  const W = 620;
  const H = height;
  const PADX = 55;
  const PADY = 24;

  const allVals = groups.flatMap((g) => metric.weekly.map((w) => w.value[g])).filter((v): v is number => v != null);
  const min = Math.min(0, ...allVals);
  const max = Math.max(1, ...allVals) * 1.08;
  const range = max - min || 1;

  const xFor = (i: number) =>
    metric.weekly.length > 1 ? PADX + (i * (W - PADX - 20)) / (metric.weekly.length - 1) : W / 2;
  const yFor = (v: number) => H - PADY - ((v - min) / range) * (H - PADY * 2);

  const linesByGroup = groups.map((g) => ({
    group: g,
    points: metric.weekly.map((w, i) => ({ x: xFor(i), y: w.value[g] != null ? yFor(w.value[g]!) : null, week: w.week, value: w.value[g] })),
  }));

  const gridY = [0, 0.5, 1].map((f) => min + f * range);

  const hoveredPoint =
    hover &&
    metric.weekly.find((w) => w.week === hover.week) &&
    { week: hover.week, value: metric.weekly.find((w) => w.week === hover.week)!.value[hover.group],
      growth: basis === "lastMonth"
        ? metric.weekly.find((w) => w.week === hover.week)!.growthVsLastMonth[hover.group]
        : metric.weekly.find((w) => w.week === hover.week)!.growthVsLastYear[hover.group] };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" style={{ maxHeight: H }}>
        {gridY.map((v, i) => (
          <g key={i}>
            <line x1={PADX} x2={W - 10} y1={yFor(v)} y2={yFor(v)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={PADX - 8} y={yFor(v) + 3} fontSize={10} textAnchor="end" fill="var(--color-muted-foreground)">
              {fmtHard(v, meta.kind)}
            </text>
          </g>
        ))}

        {linesByGroup.map(({ group, points }) => {
          const valid = points.filter((p): p is { x: number; y: number; week: number; value: number | null } => p.y != null);
          return (
            <g key={group}>
              {valid.length > 1 && (
                <polyline
                  points={valid.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={GROUP_COLOR[group]}
                  strokeWidth={group === "control" ? 2 : 2.75}
                  strokeDasharray={group === "control" ? "5 4" : undefined}
                />
              )}
              {valid.map((p) => (
                <circle
                  key={p.week}
                  cx={p.x}
                  cy={p.y}
                  r={hover?.group === group && hover?.week === p.week ? 7 : 5}
                  fill={GROUP_COLOR[group]}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover({ group, week: p.week })}
                  onMouseLeave={() => setHover(null)}
                />
              ))}
            </g>
          );
        })}

        {metric.weekly.map((w, i) => (
          <text key={w.week} x={xFor(i)} y={H - 4} fontSize={11} textAnchor="middle" fill="var(--color-muted-foreground)">
            Week {w.week}
          </text>
        ))}
      </svg>

      {hoveredPoint && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg"
          style={{
            left: `${(xFor(metric.weekly.findIndex((w) => w.week === hover!.week)) / W) * 100}%`,
            top: `${(yFor(hoveredPoint.value ?? 0) / H) * 100 - 2}%`,
          }}
        >
          <div>{fmtHard(hoveredPoint.value, meta.kind)}</div>
          <div className="text-[11px] opacity-80">
            {fmtGrowth(hoveredPoint.growth, meta.kind)} {fmtMonthLabel(basis)}
          </div>
        </div>
      )}
      <p className="mt-2 text-center text-[11px] text-muted-foreground">Hover a point for growth {fmtMonthLabel(basis)}</p>
    </div>
  );
}

// ==================== stock chart ====================

function StockWeeklyChart({ weekly }: { weekly: { week: number; approvedStoreAvailability: number | null; poorStoreAvailability: number | null }[] }) {
  const [hover, setHover] = useState<{ group: "approved" | "poor"; week: number } | null>(null);
  const W = 620, H = 240, PADX = 55, PADY = 24;
  const min = 0;
  const max = 110;
  const xFor = (i: number) => (weekly.length > 1 ? PADX + (i * (W - PADX - 20)) / (weekly.length - 1) : W / 2);
  const yFor = (v: number) => H - PADY - ((v - min) / (max - min)) * (H - PADY * 2);

  const approvedPts = weekly.map((w, i) => ({ x: xFor(i), y: w.approvedStoreAvailability != null ? yFor(w.approvedStoreAvailability) : null, week: w.week, value: w.approvedStoreAvailability }));
  const poorPts = weekly.map((w, i) => ({ x: xFor(i), y: w.poorStoreAvailability != null ? yFor(w.poorStoreAvailability) : null, week: w.week, value: w.poorStoreAvailability }));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        <line x1={PADX} x2={W - 10} y1={yFor(100)} y2={yFor(100)} stroke="var(--color-warning)" strokeDasharray="5 4" strokeWidth={1.5} />
        <text x={W - 10} y={yFor(100) - 6} fontSize={10} textAnchor="end" fill="var(--color-warning)">100% target</text>
        {[0, 50].map((v) => (
          <g key={v}>
            <line x1={PADX} x2={W - 10} y1={yFor(v)} y2={yFor(v)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={PADX - 8} y={yFor(v) + 3} fontSize={10} textAnchor="end" fill="var(--color-muted-foreground)">{v}%</text>
          </g>
        ))}

        {([["approved", approvedPts], ["poor", poorPts]] as const).map(([group, pts]) => {
          const valid = pts.filter((p): p is { x: number; y: number; week: number; value: number | null } => p.y != null);
          return (
            <g key={group}>
              {valid.length > 1 && (
                <polyline points={valid.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={GROUP_COLOR[group]} strokeWidth={2.75} />
              )}
              {valid.map((p) => (
                <circle
                  key={p.week}
                  cx={p.x}
                  cy={p.y}
                  r={hover?.group === group && hover?.week === p.week ? 7 : 5}
                  fill={GROUP_COLOR[group]}
                  onMouseEnter={() => setHover({ group, week: p.week })}
                  onMouseLeave={() => setHover(null)}
                />
              ))}
            </g>
          );
        })}

        {weekly.map((w, i) => (
          <text key={w.week} x={xFor(i)} y={H - 4} fontSize={11} textAnchor="middle" fill="var(--color-muted-foreground)">Week {w.week}</text>
        ))}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg"
          style={{
            left: `${(xFor(weekly.findIndex((w) => w.week === hover.week)) / W) * 100}%`,
            top: `${(yFor((hover.group === "approved" ? approvedPts : poorPts).find((p) => p.week === hover.week)?.value ?? 0) / H) * 100 - 2}%`,
          }}
        >
          {fmtPercent((hover.group === "approved" ? approvedPts : poorPts).find((p) => p.week === hover.week)?.value ?? null)} availability
        </div>
      )}
    </div>
  );
}

// ==================== views ====================

type View = "summary" | "metrics" | "stores" | "execution";
const VIEW_LABELS: Record<View, string> = { summary: "Summary", metrics: "Detailed metrics", stores: "Store performance", execution: "Execution analysis" };

function groupValue<T>(gv: GroupValues<T>, g: ContestGroup): T {
  return gv[g];
}

function SummaryView({ report, basis, onNavigate }: { report: ContestMonthReport; basis: ComparisonBasis; onNavigate: (v: View) => void }) {
  const { verdict } = report;
  const gmv = report.metrics.find((m) => m.key === "gmv")!;

  const groups: ContestGroup[] = ["approved", "poor", "control"];
  const counts: Record<ContestGroup, number> = {
    approved: verdict.approvedStoreCount,
    poor: verdict.poorStoreCount,
    control: verdict.controlStoreCount,
  };
  const defn: Record<ContestGroup, string> = {
    approved: "Campaign ran · classified as approved as of the latest week",
    poor: "Campaign ran · not classified as approved as of the latest week",
    control: "No Campaign Data row as of the latest week",
  };

  const incrementalPositive = (verdict.incrementalValueVsLastMonth ?? 0) >= 0;

  return (
    <div className="space-y-4">
      <div className={cn("rounded-2xl border border-border bg-card p-6 border-l-[3px]", incrementalPositive ? "border-l-success" : "border-l-danger")}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Headline finding · {fmtMonthLabel(basis)}</span>
        <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          The average approved-display store sold{" "}
          <span className={pctColor(verdict.incrementalValueVsLastMonth)}>{fmtINR(verdict.incrementalValueVsLastMonth)} more</span> than it would
          have at the control group&apos;s pace.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          That&apos;s on top of an average {fmtINR(verdict.approvedGmvThisMonth)} per store already, across {verdict.approvedStoreCount} approved
          stores. The average poor-execution store ({verdict.poorStoreCount} stores) grew {fmtGrowth(verdict.poorGrowthVsLastMonth, "currency")} — {" "}
          {verdict.poorGrowthVsLastMonth != null && verdict.controlGrowthVsLastMonth != null && Math.abs(verdict.poorGrowthVsLastMonth - verdict.controlGrowthVsLastMonth) < 5
            ? "close to the control group's own pace, suggesting the display alone didn't move sales without approval."
            : "see Execution analysis for what separated them."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {groups.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onNavigate("stores")}
            className="rounded-2xl border border-t-[3px] border-border bg-card p-4 text-left transition-colors hover:border-primary"
            style={{ borderTopColor: GROUP_COLOR[g] }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{GROUP_LABELS[g]}</span>
              <span className="text-[11px] text-muted-foreground">{counts[g]} stores (latest wk)</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{defn[g]}</p>
            <div className="group/val relative mt-3 inline-block cursor-pointer">
              <span className="text-2xl font-semibold tabular-nums text-foreground">{fmtINR(groupValue(gmv.monthAvg, g))}</span>
              <div className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background group-hover/val:block">
                {fmtGrowth(basis === "lastMonth" ? gmv.monthGrowthVsLastMonth[g] : gmv.monthGrowthVsLastYear[g], "currency")} {fmtMonthLabel(basis)}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">avg GMV per store this month</p>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Store counts by week</h3>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          A store&apos;s group can change week to week (approved one week, rejected the next) — so this is shown per week rather than one count for the month.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Group</th>
                {report.weeklyGroupCounts.map((w) => (
                  <th key={w.week} className="px-3 py-2 text-right font-semibold">Week {w.week}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium" style={{ color: GROUP_COLOR[g] }}>{GROUP_LABELS[g]}</td>
                  {report.weeklyGroupCounts.map((w) => (
                    <td key={w.week} className="px-3 py-2 text-right tabular-nums text-foreground">{w[g]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Sales (GMV), week by week</h3>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">Average rupee sales per store, per week — not indexed, not percentage.</p>
        <GroupLegend />
        <div className="mt-3">
          <WeeklyChart metric={gmv} basis={basis} />
        </div>
      </div>
    </div>
  );
}

function InventoryCaveat({ report }: { report: ContestMonthReport }) {
  const { avgStoreAvailability } = report.stock;
  if (avgStoreAvailability.approved == null || avgStoreAvailability.poor == null) return null;
  const gap = avgStoreAvailability.approved - avgStoreAvailability.poor;
  if (gap < 10) return null;

  const worstWeek = [...report.stock.weekly].sort((a, b) => (a.poorStoreAvailability ?? 100) - (b.poorStoreAvailability ?? 100))[0];

  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/40 border-l-[3px] border-l-warning bg-warning/5 p-3.5">
      <span className="mt-0.5 text-base">⚠️</span>
      <p className="text-[12.5px] leading-relaxed text-foreground">
        <b className="text-warning">Inventory caveat:</b> Poor execution stores averaged just{" "}
        <b className="text-warning">{fmtPercent(avgStoreAvailability.poor)} store availability</b> this month (vs {fmtPercent(avgStoreAvailability.approved)} for Approved)
        {worstWeek?.poorStoreAvailability != null && (
          <>
            , dropping to <b className="text-warning">{fmtPercent(worstWeek.poorStoreAvailability)} in week {worstWeek.week}</b>
          </>
        )}
        . Some of this group&apos;s weaker sales likely reflects empty shelves, not display quality alone.
      </p>
    </div>
  );
}

function FullDataTable({ report, basis }: { report: ContestMonthReport; basis: ComparisonBasis }) {
  const groups: ContestGroup[] = ["approved", "poor", "control"];
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <div className="p-5 pb-2">
        <h3 className="text-sm font-semibold text-foreground">Full data table</h3>
        <p className="mt-1 text-xs text-muted-foreground">Average per store this month, and change {fmtMonthLabel(basis)}, per metric and group.</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-t border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-semibold">Metric</th>
            {groups.map((g) => (
              <th key={g} className="px-4 py-2.5 text-right font-semibold">
                <span style={{ color: GROUP_COLOR[g] }}>{GROUP_LABELS[g]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.metrics.map((m) => {
            const meta = SELL_METRICS.find((sm) => sm.key === m.key)!;
            return (
              <tr key={m.key} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium text-foreground">{meta.label}</td>
                {groups.map((g) => {
                  const growth = basis === "lastMonth" ? m.monthGrowthVsLastMonth[g] : m.monthGrowthVsLastYear[g];
                  return (
                    <td key={g} className="px-4 py-2.5 text-right tabular-nums">
                      <span className="font-medium text-foreground">{fmtHard(m.monthAvg[g], meta.kind)}</span>{" "}
                      <span className={cn("text-xs", pctColor(growth))}>{fmtGrowth(growth, meta.kind)}</span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr>
            <td className="px-4 py-2.5 font-medium text-foreground">Store availability</td>
            <td className="px-4 py-2.5 text-right tabular-nums font-medium text-foreground">{fmtPercent(report.stock.avgStoreAvailability.approved)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums font-medium text-foreground">{fmtPercent(report.stock.avgStoreAvailability.poor)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">no data</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MetricsView({ report, basis }: { report: ContestMonthReport; basis: ComparisonBasis }) {
  return (
    <div className="space-y-4">
      <InventoryCaveat report={report} />
      <GroupLegend />

      {report.metrics.map((m) => {
        const meta = SELL_METRICS.find((sm) => sm.key === m.key)!;
        return (
          <div key={m.key} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
              <div className="flex gap-4 text-xs text-muted-foreground">
                {(["approved", "poor", "control"] as ContestGroup[]).map((g) => (
                  <span key={g}>
                    <span style={{ color: GROUP_COLOR[g] }} className="font-medium">
                      {fmtHard(m.monthAvg[g], meta.kind)}
                    </span>{" "}
                    avg
                  </span>
                ))}
              </div>
            </div>
            <p className="mb-3 mt-1 text-xs text-muted-foreground">{meta.what}</p>
            <WeeklyChart metric={m} basis={basis} />
          </div>
        );
      })}

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Stock &amp; inventory status</h3>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">
          Store and warehouse availability by week, as reported directly on the sheet. Control carries no inventory data.
        </p>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBox label="Approved avg store availability" value={fmtPercent(report.stock.avgStoreAvailability.approved)} />
          <StatBox label="Poor avg store availability" value={fmtPercent(report.stock.avgStoreAvailability.poor)} warn />
          <StatBox label="Approved avg WH availability" value={fmtPercent(report.stock.avgWhAvailability.approved)} />
          <StatBox label="Poor avg WH availability" value={fmtPercent(report.stock.avgWhAvailability.poor)} warn />
        </div>

        <div className="mb-3 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: GROUP_COLOR.approved }} />Approved</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: GROUP_COLOR.poor }} />Poor execution</span>
        </div>
        <StockWeeklyChart weekly={report.stock.weekly} />
      </div>

      <FullDataTable report={report} basis={basis} />
    </div>
  );
}

function StatBox({ label, value, warn, sub }: { label: string; value: string; warn?: boolean; sub?: string }) {
  return (
    <div className="rounded-xl bg-input p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", warn ? "text-danger" : "text-foreground")}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function StoresView({ report, basis }: { report: ContestMonthReport; basis: ComparisonBasis }) {
  const groupOrder: Record<ContestGroup, number> = { approved: 0, poor: 1, control: 2 };
  const sorted = [...report.stores].sort((a, b) => {
    if (a.group !== b.group) return groupOrder[a.group] - groupOrder[b.group];
    const av = basis === "lastMonth" ? a.gmvGrowthVsLastMonth : a.gmvGrowthVsLastYear;
    const bv = basis === "lastMonth" ? b.gmvGrowthVsLastMonth : b.gmvGrowthVsLastYear;
    return (bv ?? -Infinity) - (av ?? -Infinity);
  });

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="p-5 pb-3">
        <h3 className="text-sm font-semibold text-foreground">Store performance</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Every store, ranked by GMV growth {fmtMonthLabel(basis)}. Group is shown per week — it can change month to month, and even week to week.
        </p>
        <div className="mt-3"><GroupLegend /></div>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {sorted.map((s) => {
          const growth = basis === "lastMonth" ? s.gmvGrowthVsLastMonth : s.gmvGrowthVsLastYear;
          return (
            <div key={s.storeId} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 last:border-0">
              <div className="flex min-w-[130px] gap-1">
                {s.statusByWeek.map((sw) => (
                  <span
                    key={sw.week}
                    title={`Week ${sw.week}: ${sw.status ?? "no campaign data"}`}
                    className="rounded-md px-1.5 py-1 text-center text-[10px] font-semibold"
                    style={{ background: `color-mix(in srgb, ${GROUP_COLOR[sw.group]} 14%, transparent)`, color: GROUP_COLOR[sw.group] }}
                  >
                    W{sw.week}
                  </span>
                ))}
              </div>
              <div className="min-w-[180px] flex-1">
                <p className="text-sm font-medium text-foreground">{s.storeName}</p>
                <p className="text-[11px] text-muted-foreground">{s.latestStatus ? `Latest: ${s.latestStatus}` : "No campaign data"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">{fmtINR(s.gmv)}</p>
                <p className="text-[11px] text-muted-foreground">GMV</p>
              </div>
              <div className={cn("min-w-[70px] text-right text-sm font-semibold tabular-nums", pctColor(growth))}>
                {growth == null ? "no data" : fmtGrowth(growth, "currency")}
              </div>
              {s.group !== "control" && (
                <div className="min-w-[80px] text-right text-xs text-muted-foreground">
                  {fmtPercent(s.storeAvailability)} avail.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExecutionView({ report, basis }: { report: ContestMonthReport; basis: ComparisonBasis }) {
  const byStatus = useMemo(() => {
    const groups = new Map<string, { statuses: string[]; group: ContestGroup; values: number[]; n: number }>();
    for (const s of report.stores) {
      const key = s.group === "control" ? "Control (no campaign)" : s.latestStatus ?? "Unknown";
      const growth = basis === "lastMonth" ? s.gmvGrowthVsLastMonth : s.gmvGrowthVsLastYear;
      const entry = groups.get(key) ?? { statuses: [key], group: s.group, values: [], n: 0 };
      if (growth != null) entry.values.push(growth);
      entry.n += 1;
      groups.set(key, entry);
    }
    return [...groups.entries()]
      .map(([label, v]) => ({
        label,
        group: v.group,
        n: v.n,
        median: v.values.length ? [...v.values].sort((a, b) => a - b)[Math.floor(v.values.length / 2)] : null,
      }))
      .sort((a, b) => (b.median ?? -Infinity) - (a.median ?? -Infinity));
  }, [report.stores, basis]);

  const maxAbs = Math.max(1, ...byStatus.map((s) => Math.abs(s.median ?? 0)));

  const scatterPoints = report.stores.filter((s) => s.group !== "control" && s.storeAvailability != null);
  const growthOf = (s: StoreRow) => (basis === "lastMonth" ? s.gmvGrowthVsLastMonth : s.gmvGrowthVsLastYear);
  const scatterGrowths = scatterPoints.map(growthOf).filter((v): v is number => v != null);
  const gMin = Math.min(0, ...scatterGrowths);
  const gMax = Math.max(1, ...scatterGrowths);

  const SW = 600, SH = 280, SPADX = 60, SPADY = 20;
  const xFor = (fill: number) => SPADX + (fill / 100) * (SW - SPADX - 20);
  const yFor = (g: number) => SH - SPADY - ((g - gMin) / (gMax - gMin || 1)) * (SH - SPADY * 2);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">GMV growth by exact status</h3>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">
          Approved and poor-execution stores aren&apos;t uniform — each status performs differently. Growth shown is the median {fmtMonthLabel(basis)}.
        </p>
        <div className="space-y-3">
          {byStatus.map((s) => {
            const width = s.median == null ? 4 : Math.max(4, (Math.abs(s.median) / maxAbs) * 100);
            return (
              <div key={s.label} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-xs text-foreground" title={s.label}>{s.label}</span>
                <div className="h-6 flex-1 rounded bg-input">
                  <div
                    className="flex h-full items-center rounded pl-2 text-[11px] font-medium text-background"
                    style={{ width: `${width}%`, background: GROUP_COLOR[s.group] }}
                  >
                    {fmtGrowth(s.median, "currency")}
                  </div>
                </div>
                <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">{s.n} stores</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Store availability vs sales growth</h3>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">Each dot is one store that ran the campaign — does poor execution track with poor stock availability?</p>
        <svg viewBox={`0 0 ${SW} ${SH}`} className="h-auto w-full">
          <line x1={SPADX} x2={SW - 10} y1={SH - SPADY} y2={SH - SPADY} stroke="var(--color-border)" strokeWidth={1} />
          <line x1={SPADX} x2={SPADX} y1={10} y2={SH - SPADY} stroke="var(--color-border)" strokeWidth={1} />
          <text x={SPADX - 8} y={16} fontSize={10} textAnchor="end" fill="var(--color-muted-foreground)">{fmtGrowth(gMax, "currency")}</text>
          <text x={SPADX - 8} y={SH - SPADY} fontSize={10} textAnchor="end" fill="var(--color-muted-foreground)">{fmtGrowth(gMin, "currency")}</text>
          <text x={SPADX} y={SH - 4} fontSize={10} fill="var(--color-muted-foreground)">0% available</text>
          <text x={SW - 10} y={SH - 4} fontSize={10} textAnchor="end" fill="var(--color-muted-foreground)">100% available</text>
          {scatterPoints.map((s) => {
            const g = growthOf(s);
            if (g == null || s.storeAvailability == null) return null;
            return (
              <circle
                key={s.storeId}
                cx={xFor(s.storeAvailability)}
                cy={yFor(g)}
                r={5}
                fill={GROUP_COLOR[s.group]}
                opacity={0.8}
              >
                <title>{`${s.storeName}: ${fmtPercent(s.storeAvailability)} available, ${fmtGrowth(g, "currency")}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ==================== shell ====================

export function ReportClient({
  campaigns,
  months,
  campaignKey,
  month,
  report,
}: {
  campaigns: CampaignOption[];
  months: string[];
  campaignKey: string | null;
  month: string | null;
  report: ContestMonthReport | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [view, setView] = useState<View>("summary");
  const [basis, setBasis] = useState<ComparisonBasis>("lastMonth");

  function navigate(next: { campaign?: string | null; month?: string | null }) {
    const params = new URLSearchParams();
    const campaign = next.campaign !== undefined ? next.campaign : campaignKey;
    const m = next.month !== undefined ? next.month : month;
    if (campaign) params.set("campaign", campaign);
    if (m) params.set("month", m);
    setView("summary");
    startTransition(() => router.replace(`/contest-impact?${params.toString()}`, { scroll: false }));
  }

  const campaignOptions = campaigns.map((c) => ({ id: c.key, label: c.label }));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contest Impact</h1>
          <p className="mt-1 text-sm text-muted-foreground">Approved execution, poor execution, and a control group that never ran the display.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="w-64">
            <SelectSearch
              options={campaignOptions}
              value={campaignKey}
              onChange={(key) => navigate({ campaign: key, month: null })}
              placeholder="Pick a campaign…"
              emptyText="No campaign data uploaded yet"
            />
          </div>
          <select className={selectClass} value={month ?? ""} onChange={(e) => navigate({ month: e.target.value || null })}>
            {months.length === 0 && <option value="">No data yet</option>}
            {months.map((m) => (
              <option key={m} value={m}>
                {new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!report && (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No contest data yet for this selection. Import a sheet first.
        </div>
      )}

      {report && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex w-fit rounded-xl border border-border bg-input p-0.5">
              {(Object.keys(VIEW_LABELS) as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
            <ComparisonToggle basis={basis} onChange={setBasis} />
          </div>

          <div className="mt-4">
            {view === "summary" && <SummaryView report={report} basis={basis} onNavigate={setView} />}
            {view === "metrics" && <MetricsView report={report} basis={basis} />}
            {view === "stores" && <StoresView report={report} basis={basis} />}
            {view === "execution" && <ExecutionView report={report} basis={basis} />}
          </div>
        </>
      )}
    </div>
  );
}
