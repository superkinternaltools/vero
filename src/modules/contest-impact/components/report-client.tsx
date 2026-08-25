"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { Maximize2, MessageCircle, RefreshCw, ChevronDown } from "lucide-react";
import { SelectSearch } from "@/core/ui/select-search";
import { Modal } from "@/core/ui/modal";
import { cn } from "@/core/lib/utils";
import { SELL_METRICS, GROUP_LABELS, DIAGNOSIS_VERDICT_LABELS } from "../types";
import { ChatPanel } from "./chat-panel";
import { regenerateContestReport } from "../actions";
import type { ContestReport } from "../queries";
import type {
  CampaignOption,
  ComparisonBasis,
  ContestGroup,
  ContestMonthReport,
  DiagnosisVerdict,
  MetricKind,
  MetricSeries,
  StoreRow,
  WeeklyGroupCounts,
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
  if (kind === "days") return v == null ? "—" : `${v.toFixed(1)}d`;
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
      n: metric.weekly.find((w) => w.week === hover.week)!.n[hover.group],
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
          <div className="text-[11px] opacity-80">{hoveredPoint.n} {hoveredPoint.n === 1 ? "store" : "stores"}</div>
        </div>
      )}
      <p className="mt-2 text-center text-[11px] text-muted-foreground">Hover a point for growth {fmtMonthLabel(basis)}</p>
    </div>
  );
}

// ==================== stock charts ====================

type StockSeries = "total" | "approved" | "poor";
const STOCK_SERIES_COLOR: Record<StockSeries, string> = {
  total: "var(--color-foreground)",
  approved: "var(--color-success)",
  poor: "var(--color-danger)",
};
const STOCK_SERIES_LABEL: Record<StockSeries, string> = { total: "Total", approved: "Approved", poor: "Poor" };

/** Store availability by group, with a clickable legend (click a series to
 * focus it — the others fade) and hover tooltips showing the exact value. */
function StoreAvailabilityChart({
  weekly,
  groupCounts,
}: {
  weekly: { week: number; totalStoreAvailability: number | null; approvedStoreAvailability: number | null; poorStoreAvailability: number | null }[];
  groupCounts: WeeklyGroupCounts[];
}) {
  const [hover, setHover] = useState<{ series: StockSeries; week: number } | null>(null);
  const countFor = (series: StockSeries, week: number): number | null => {
    const wk = groupCounts.find((w) => w.week === week);
    if (!wk) return null;
    return series === "total" ? wk.approved + wk.poor : wk[series];
  };
  const [focus, setFocus] = useState<StockSeries | null>(null);
  const W = 620, H = 240, PADX = 55, PADY = 24;
  const min = 0;
  const max = 110;
  const xFor = (i: number) => (weekly.length > 1 ? PADX + (i * (W - PADX - 20)) / (weekly.length - 1) : W / 2);
  const yFor = (v: number) => H - PADY - ((v - min) / (max - min)) * (H - PADY * 2);

  const fieldFor: Record<StockSeries, "totalStoreAvailability" | "approvedStoreAvailability" | "poorStoreAvailability"> = {
    total: "totalStoreAvailability",
    approved: "approvedStoreAvailability",
    poor: "poorStoreAvailability",
  };
  const ptsFor = (series: StockSeries) =>
    weekly.map((w, i) => ({ x: xFor(i), y: w[fieldFor[series]] != null ? yFor(w[fieldFor[series]]!) : null, week: w.week, value: w[fieldFor[series]] }));
  const series: StockSeries[] = ["total", "approved", "poor"];
  const allPts = Object.fromEntries(series.map((s) => [s, ptsFor(s)])) as Record<StockSeries, ReturnType<typeof ptsFor>>;

  const hoveredValue = hover ? allPts[hover.series].find((p) => p.week === hover.week) : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {series.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFocus((f) => (f === s ? null : s))}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
              focus === s ? "border-current bg-card" : focus != null ? "border-transparent text-muted-foreground opacity-50" : "border-transparent bg-input text-muted-foreground",
            )}
            style={focus === s ? { color: STOCK_SERIES_COLOR[s] } : undefined}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: STOCK_SERIES_COLOR[s] }} />
            {STOCK_SERIES_LABEL[s]}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-muted-foreground">
          {focus ? `Focused on ${STOCK_SERIES_LABEL[focus]}` : "Click a series to focus it"}
        </span>
      </div>

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

          {series.map((s) => {
            const pts = allPts[s];
            const valid = pts.filter((p): p is { x: number; y: number; week: number; value: number | null } => p.y != null);
            const faded = focus != null && focus !== s;
            return (
              <g key={s} style={{ transition: "opacity 0.2s ease", opacity: faded ? 0.18 : 1 }}>
                {valid.length > 1 && (
                  <polyline
                    points={valid.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={STOCK_SERIES_COLOR[s]}
                    strokeWidth={focus === s ? 3.5 : 2.75}
                  />
                )}
                {valid.map((p) => (
                  <circle
                    key={p.week}
                    cx={p.x}
                    cy={p.y}
                    r={hover?.series === s && hover?.week === p.week ? 7 : 5}
                    fill={STOCK_SERIES_COLOR[s]}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHover({ series: s, week: p.week })}
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
        {hover && hoveredValue && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg"
            style={{
              left: `${(xFor(weekly.findIndex((w) => w.week === hover.week)) / W) * 100}%`,
              top: `${(yFor(hoveredValue.value ?? 0) / H) * 100 - 2}%`,
            }}
          >
            <div>{STOCK_SERIES_LABEL[hover.series]}: {fmtPercent(hoveredValue.value)}</div>
            {(() => {
              const n = countFor(hover.series, hover.week);
              return n != null ? <div className="text-[11px] opacity-80">{n} {n === 1 ? "store" : "stores"}</div> : null;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

/** Warehouse availability — a single shared pool, so one line and no legend. */
function WarehouseAvailabilityChart({ weekly }: { weekly: { week: number; whAvailability: number | null }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 620, H = 200, PADX = 55, PADY = 24;
  const min = 0;
  const max = 110;
  const xFor = (i: number) => (weekly.length > 1 ? PADX + (i * (W - PADX - 20)) / (weekly.length - 1) : W / 2);
  const yFor = (v: number) => H - PADY - ((v - min) / (max - min)) * (H - PADY * 2);
  const pts = weekly.map((w, i) => ({ x: xFor(i), y: w.whAvailability != null ? yFor(w.whAvailability) : null, week: w.week, value: w.whAvailability }));
  const valid = pts.filter((p): p is { x: number; y: number; week: number; value: number | null } => p.y != null);
  const hoveredPt = hover != null ? pts.find((p) => p.week === hover) : null;

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
        {valid.length > 1 && (
          <polyline points={valid.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--color-foreground)" strokeWidth={2.75} />
        )}
        {valid.map((p) => (
          <circle
            key={p.week}
            cx={p.x}
            cy={p.y}
            r={hover === p.week ? 7 : 5}
            fill="var(--color-foreground)"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(p.week)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {weekly.map((w, i) => (
          <text key={w.week} x={xFor(i)} y={H - 4} fontSize={11} textAnchor="middle" fill="var(--color-muted-foreground)">Week {w.week}</text>
        ))}
      </svg>
      {hoveredPt && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg"
          style={{
            left: `${(xFor(weekly.findIndex((w) => w.week === hover)) / W) * 100}%`,
            top: `${(yFor(hoveredPt.value ?? 0) / H) * 100 - 2}%`,
          }}
        >
          {fmtPercent(hoveredPt.value)} availability
        </div>
      )}
    </div>
  );
}

// ==================== inventory summary (Summary view only) ====================

/** A stat with a thin fill-level bar underneath, so Total/Approved/Poor can
 * be compared visually, not just by reading three numbers. */
function StatBar({ label, value, sub, accent }: { label: string; value: number | null; sub?: string; accent: string }) {
  const pct = value == null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <div className="mb-3.5 last:mb-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
          {label}
          {sub && <span className="text-[10px] font-normal text-muted-foreground">{sub}</span>}
        </span>
        <span className="text-lg font-semibold tabular-nums" style={{ color: accent }}>{fmtPercent(value)}</span>
      </div>
      <div className="relative h-1 w-full rounded-full" style={{ background: "var(--color-border)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: accent }} />
        <div className="absolute -top-0.5 -bottom-0.5 w-0.5" style={{ left: "100%", background: "var(--color-warning)" }} />
      </div>
    </div>
  );
}

/** Shows the chart at its normal compact size, plus an expand button that
 * opens the same chart (same interactivity — legend focus, hover) larger in
 * a modal, for when the compact version is too small to read comfortably. */
function ExpandableChart({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Enlarge ${title}`}
        title="Click to enlarge"
        className="absolute right-0 top-0 z-10 rounded-md border border-border bg-card p-1.5 text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title={title} size="xl">
        {children}
      </Modal>
    </div>
  );
}

function InventorySummarySection({ report }: { report: ContestMonthReport }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Store inventory</h3>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">In-store SKU availability against target, month-to-date, by execution group.</p>

        <div className="min-h-36">
          <StatBar label="Total" sub="all contest stores" value={report.stock.avgStoreAvailability.total} accent={STOCK_SERIES_COLOR.total} />
          <StatBar label="Approved" sub={`${report.verdict.approvedStoreCount} stores`} value={report.stock.avgStoreAvailability.approved} accent={STOCK_SERIES_COLOR.approved} />
          <StatBar label="Poor" sub={`${report.verdict.poorStoreCount} stores`} value={report.stock.avgStoreAvailability.poor} accent={STOCK_SERIES_COLOR.poor} />
        </div>

        <h4 className="mb-1 mt-4 text-xs font-semibold text-foreground">Week-on-week</h4>
        <ExpandableChart title="Store availability, week on week">
          <StoreAvailabilityChart weekly={report.stock.weekly} groupCounts={report.weeklyGroupCounts} />
        </ExpandableChart>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Warehouse inventory</h3>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">Warehouse SKU availability against target, month-to-date, across all SKUs in this campaign.</p>

        <div className="min-h-36">
          <StatBar label="Total" sub="all SKUs" value={report.stock.avgWhAvailability} accent={STOCK_SERIES_COLOR.total} />
        </div>

        <h4 className="mb-1 mt-4 text-xs font-semibold text-foreground">Week-on-week</h4>
        <ExpandableChart title="Warehouse availability, week on week">
          <WarehouseAvailabilityChart weekly={report.stock.weeklyWarehouse} />
        </ExpandableChart>
      </div>
    </div>
  );
}

// ==================== views ====================

type View = "summary" | "metrics" | "stores" | "execution";
const VIEW_LABELS: Record<View, string> = { summary: "Summary", metrics: "Detailed metrics", stores: "Store performance", execution: "Is it working?" };

function SummaryView({ report, onNavigateToStores }: { report: ContestMonthReport; onNavigateToStores: () => void }) {
  return (
    <div className="space-y-4">
      <InventorySummarySection report={report} />
      <ExecutionGroupsCard report={report} onNavigateToStores={onNavigateToStores} />
    </div>
  );
}

/** One row per group — name, GMV, sell-through, and the current store count
 * — plus a single week-by-week strip for how the approved/poor pool
 * reshuffles. Sell-through (not a raw stock rupee figure) is the number that
 * actually says who's converting better, and the weekly counts live in
 * exactly one place instead of two. Carries its own compare-against toggle
 * — each chart/table on the page compares independently now, rather than
 * one setting driving the whole report. */
function ExecutionGroupsCard({ report, onNavigateToStores }: { report: ContestMonthReport; onNavigateToStores: () => void }) {
  const [basis, setBasis] = useState<ComparisonBasis>("lastMonth");
  const gmv = report.metrics.find((m) => m.key === "gmv")!;
  const sellThrough = report.metrics.find((m) => m.key === "sellThrough");
  const doh = report.metrics.find((m) => m.key === "doh");
  const groups: ContestGroup[] = ["approved", "poor", "control"];

  const lastWeek = report.weeklyGroupCounts[report.weeklyGroupCounts.length - 1];
  const splitRows = report.weeklyGroupCounts.map((w) => ({ week: w.week, approved: w.approved, poor: w.poor, total: w.approved + w.poor }));
  const showSplit = splitRows.some((r) => r.total > 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Execution groups</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Approved — campaign ran, approved. Poor — campaign ran, not approved. Control — no campaign data at all.
          </p>
        </div>
        <ComparisonToggle basis={basis} onChange={setBasis} />
      </div>
      <div className="divide-y divide-border">
        {groups.map((g) => {
          const growth = basis === "lastMonth" ? gmv.monthGrowthVsLastMonth[g] : gmv.monthGrowthVsLastYear[g];
          const weekCounts = report.weeklyGroupCounts.map((w) => w[g]);
          const allSame = weekCounts.length > 0 && weekCounts.every((c) => c === weekCounts[0]);
          const st = sellThrough?.monthAvg[g] ?? null;
          const dohVal = doh?.monthAvg[g] ?? null;
          return (
            <button
              key={g}
              type="button"
              onClick={onNavigateToStores}
              className="grid w-full grid-cols-1 items-center gap-2 py-3.5 text-left first:pt-3 last:pb-0 sm:grid-cols-[1.3fr_1fr_0.9fr_0.7fr] sm:gap-4"
            >
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: GROUP_COLOR[g] }} />
                {GROUP_LABELS[g]}
              </div>
              <div>
                <span className="text-lg font-semibold tabular-nums" style={{ color: GROUP_COLOR[g] }}>
                  {fmtINR(gmv.monthAvg[g])}
                </span>
                <p className="text-[11px] text-muted-foreground">GMV · {fmtGrowth(growth, "currency")} {fmtMonthLabel(basis)}</p>
              </div>
              <div>
                <span className="text-lg font-semibold tabular-nums text-foreground">{st != null ? `${st.toFixed(1)}%` : "—"}</span>
                <p className="text-[11px] text-muted-foreground">
                  sell-through{dohVal != null && ` · ${dohVal.toFixed(0)}d on hand`}
                </p>
              </div>
              <div className="sm:text-right">
                <span className="text-lg font-semibold tabular-nums text-foreground">{lastWeek ? lastWeek[g] : (weekCounts[0] ?? 0)}</span>
                <p className="text-[11px] text-muted-foreground">{allSame ? "stores" : `stores, latest wk ${lastWeek?.week ?? ""}`}</p>
              </div>
            </button>
          );
        })}
      </div>

      {showSplit && (
        <div className="mt-4 border-t border-border pt-4">
          <h4 className="text-xs font-semibold text-foreground">Approved ⇄ poor, week by week</h4>
          <p className="mb-3 mt-0.5 text-[11px] text-muted-foreground">
            The same pool of contest stores reshuffles as verdicts change — control isn&apos;t part of this pool.
          </p>
          <div className="space-y-1.5">
            {splitRows.map((r) => (
              <div key={r.week} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-[11px] text-muted-foreground">Wk {r.week}</span>
                <div className="flex h-5 flex-1 overflow-hidden rounded-md bg-input">
                  {r.total > 0 && (
                    <>
                      <div
                        className="flex items-center justify-center text-[10px] font-medium text-background"
                        style={{ width: `${(r.approved / r.total) * 100}%`, background: GROUP_COLOR.approved }}
                      >
                        {r.approved > 0 ? r.approved : ""}
                      </div>
                      <div
                        className="flex items-center justify-center text-[10px] font-medium text-background"
                        style={{ width: `${(r.poor / r.total) * 100}%`, background: GROUP_COLOR.poor }}
                      >
                        {r.poor > 0 ? r.poor : ""}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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

function FullDataTable({ report }: { report: ContestMonthReport }) {
  const [basis, setBasis] = useState<ComparisonBasis>("lastMonth");
  const groups: ContestGroup[] = ["approved", "poor", "control"];
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Full data table</h3>
          <p className="mt-1 text-xs text-muted-foreground">Average per store per week, and change {fmtMonthLabel(basis)}, per metric and group.</p>
        </div>
        <ComparisonToggle basis={basis} onChange={setBasis} />
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

type MoveDiagnosis = {
  group: ContestGroup;
  week: number;
  gmvChangePct: number;
  stockChangePct: number | null;
  kind: "supply" | "demand" | "mixed";
};

function pctChange(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/** Compares each week's GMV move to that same week's in-store-value move, for
 * approved and poor stores — a GMV drop that tracks a stock drop is a supply
 * story, not an execution one; a GMV drop with flat stock is the opposite. */
function diagnoseWeeklyMoves(report: ContestMonthReport): MoveDiagnosis[] {
  const gmv = report.metrics.find((m) => m.key === "gmv");
  const stock = report.metrics.find((m) => m.key === "inStoreValue");
  if (!gmv || !stock) return [];

  const out: MoveDiagnosis[] = [];
  for (const g of ["approved", "poor"] as ContestGroup[]) {
    for (let i = 1; i < gmv.weekly.length; i++) {
      const prevWeek = gmv.weekly[i - 1];
      const currWeek = gmv.weekly[i];
      const gmvChangePct = pctChange(currWeek.value[g], prevWeek.value[g]);
      if (gmvChangePct == null || Math.abs(gmvChangePct) < 8) continue;

      const stockPrev = stock.weekly.find((w) => w.week === prevWeek.week);
      const stockCurr = stock.weekly.find((w) => w.week === currWeek.week);
      const stockChangePct = pctChange(stockCurr?.value[g] ?? null, stockPrev?.value[g] ?? null);

      let kind: MoveDiagnosis["kind"] = "mixed";
      if (stockChangePct != null) {
        const sameDirection = Math.sign(stockChangePct) === Math.sign(gmvChangePct);
        const stockMoved = Math.abs(stockChangePct) >= 8;
        if (sameDirection && stockMoved) kind = "supply";
        else if (!stockMoved) kind = "demand";
      }
      out.push({ group: g, week: currWeek.week, gmvChangePct, stockChangePct, kind });
    }
  }
  return out.sort((a, b) => Math.abs(b.gmvChangePct) - Math.abs(a.gmvChangePct));
}

const DIAGNOSIS_COLOR: Record<MoveDiagnosis["kind"], string> = {
  supply: "var(--color-warning)",
  demand: "var(--color-danger)",
  mixed: "var(--color-muted-foreground)",
};
const DIAGNOSIS_LABEL: Record<MoveDiagnosis["kind"], string> = {
  supply: "Supply-driven",
  demand: "Execution/demand-driven",
  mixed: "Mixed signal",
};

function WeeklyMoveDiagnosis({ report }: { report: ContestMonthReport }) {
  const moves = diagnoseWeeklyMoves(report);
  if (!moves.length) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Why GMV moved</h3>
      <p className="mb-4 mt-1 text-xs text-muted-foreground">
        Every week-on-week GMV swing of 8% or more, checked against that same week&apos;s in-store value — stock moving with GMV points to a supply
        cause, GMV moving while stock held points to execution or demand.
      </p>
      <div className="space-y-2.5">
        {moves.map((mv, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-xl border-l-[3px] bg-input p-3"
            style={{ borderLeftColor: DIAGNOSIS_COLOR[mv.kind] }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold" style={{ color: DIAGNOSIS_COLOR[mv.kind] }}>
                Week {mv.week} · {GROUP_LABELS[mv.group]} · {DIAGNOSIS_LABEL[mv.kind]}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                GMV {mv.gmvChangePct >= 0 ? "rose" : "fell"} <span className="font-medium text-foreground">{fmtGrowth(mv.gmvChangePct, "number")}</span>{" "}
                vs the prior week, while in-store value{" "}
                {mv.stockChangePct == null ? (
                  "had no comparable data"
                ) : (
                  <>
                    {mv.stockChangePct >= 0 ? "rose" : "fell"} <span className="font-medium text-foreground">{fmtGrowth(mv.stockChangePct, "number")}</span>
                  </>
                )}
                .
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One metric's card, with its own compare-against toggle — each graph on
 * the page now compares independently rather than sharing one setting. */
function MetricCard({ metric }: { metric: MetricSeries }) {
  const [basis, setBasis] = useState<ComparisonBasis>("lastMonth");
  const meta = SELL_METRICS.find((sm) => sm.key === metric.key)!;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
            <div className="flex gap-4 text-xs text-muted-foreground">
              {(["approved", "poor", "control"] as ContestGroup[]).map((g) => (
                <span key={g}>
                  <span style={{ color: GROUP_COLOR[g] }} className="font-medium">
                    {fmtHard(metric.monthAvg[g], meta.kind)}
                  </span>{" "}
                  avg/wk
                </span>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{meta.what}</p>
        </div>
        <ComparisonToggle basis={basis} onChange={setBasis} />
      </div>
      <div className="mt-3">
        <WeeklyChart metric={metric} basis={basis} />
      </div>
    </div>
  );
}

function MetricsView({ report }: { report: ContestMonthReport }) {
  return (
    <div className="space-y-4">
      <InventoryCaveat report={report} />
      <GroupLegend />

      {report.metrics.map((m) => (
        <MetricCard key={m.key} metric={m} />
      ))}

      <WeeklyMoveDiagnosis report={report} />

      <FullDataTable report={report} />
    </div>
  );
}

function StoresView({ report }: { report: ContestMonthReport }) {
  const [basis, setBasis] = useState<ComparisonBasis>("lastMonth");
  const groupOrder: Record<ContestGroup, number> = { approved: 0, poor: 1, control: 2 };
  const sorted = [...report.stores].sort((a, b) => {
    if (a.group !== b.group) return groupOrder[a.group] - groupOrder[b.group];
    const av = basis === "lastMonth" ? a.gmvGrowthVsLastMonth : a.gmvGrowthVsLastYear;
    const bv = basis === "lastMonth" ? b.gmvGrowthVsLastMonth : b.gmvGrowthVsLastYear;
    return (bv ?? -Infinity) - (av ?? -Infinity);
  });

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Store performance</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Every store, ranked by GMV growth {fmtMonthLabel(basis)}. Group is shown per week — it can change month to month, and even week to week.
            Sell-through (GMV ÷ stock on shelf) is the fairer read when comparing stores carrying very different stock levels.
          </p>
          <div className="mt-3"><GroupLegend /></div>
        </div>
        <ComparisonToggle basis={basis} onChange={setBasis} />
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
                <>
                  <div className="min-w-[80px] text-right text-xs text-muted-foreground">
                    {fmtPercent(s.storeAvailability)} avail.
                  </div>
                  <div className="min-w-[80px] text-right text-xs text-muted-foreground">
                    {fmtINR(s.inStoreValue)} stock
                  </div>
                  <div className="min-w-[70px] text-right text-xs font-medium text-foreground">
                    {s.sellThrough == null ? "—" : `${s.sellThrough.toFixed(1)}%`} sell-thru
                  </div>
                  <div className="min-w-[70px] text-right text-xs text-muted-foreground">
                    {s.doh == null ? "—" : `${s.doh.toFixed(1)}d`} on hand
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const VERDICT_STYLE: Record<DiagnosisVerdict, { bg: string; text: string; border: string }> = {
  working: { bg: "bg-success/10", text: "text-success", border: "border-l-success" },
  working_caveat: { bg: "bg-success/10", text: "text-success", border: "border-l-success" },
  not_working_supply_store: { bg: "bg-danger/10", text: "text-danger", border: "border-l-danger" },
  not_working_supply_warehouse: { bg: "bg-danger/10", text: "text-danger", border: "border-l-danger" },
  not_working_rubric: { bg: "bg-danger/10", text: "text-danger", border: "border-l-danger" },
  not_working_demand: { bg: "bg-danger/10", text: "text-danger", border: "border-l-danger" },
  inconclusive: { bg: "bg-warning/10", text: "text-warning", border: "border-l-warning" },
};

const TREND_LABEL: Record<string, string> = { improving: "improving", stable: "steady", fading: "fading" };

function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold text-foreground"
      >
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        {open ? "Hide" : "Show"} {summary}
      </button>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </div>
  );
}

function IsItWorkingView({
  report,
  aiReport,
  onRegenerateReport,
  regeneratingReport,
  onOpenChat,
}: {
  report: ContestMonthReport;
  aiReport: ContestReport | { error: string } | null;
  onRegenerateReport: () => void;
  regeneratingReport: boolean;
  onOpenChat: () => void;
}) {
  // The verdict itself is deliberately basis-independent (see diagnosis.ts) —
  // this toggle only affects the supporting-evidence charts below it.
  const [basis, setBasis] = useState<ComparisonBasis>("lastMonth");
  const gmvMetric = report.metrics.find((m) => m.key === "gmv")!;
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

  const diagnosis = aiReport && "diagnosis" in aiReport ? aiReport.diagnosis : null;
  const narrative = aiReport && "narrative" in aiReport ? aiReport.narrative : null;
  const reportError = aiReport && "error" in aiReport ? aiReport.error : null;
  const style = diagnosis ? VERDICT_STYLE[diagnosis.verdict] : VERDICT_STYLE.inconclusive;

  return (
    <div className="space-y-4">
      <div className={cn("rounded-2xl border border-border bg-card p-6 border-l-[3px]", style.border)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Is it working? · AI-generated</span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRegenerateReport}
              disabled={regeneratingReport}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", regeneratingReport && "animate-spin")} />
              Regenerate
            </button>
            <button
              type="button"
              onClick={onOpenChat}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Chat with Vero
            </button>
          </div>
        </div>

        {diagnosis && narrative ? (
          <>
            <span className={cn("mt-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium", style.bg, style.text)}>
              {DIAGNOSIS_VERDICT_LABELS[diagnosis.verdict]}
              {diagnosis.trend && `, ${TREND_LABEL[diagnosis.trend]}`}
            </span>
            <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">{narrative.verdictSentence}</p>
            <p className="mt-2 text-sm text-muted-foreground">{narrative.mechanism}</p>
            {narrative.rootCause && (
              <div className="mt-3 rounded-lg bg-input p-3">
                <p className="text-xs font-semibold text-foreground">Likely cause</p>
                <p className="mt-1 text-sm text-muted-foreground">{narrative.rootCause}</p>
              </div>
            )}
            {diagnosis.selectionBiasCaveat && (
              <p className="mt-3 text-xs text-muted-foreground">
                Note: fewer than half of approved stores have last-year data, so this verdict leans on the control-group comparison rather than
                year-on-year — approved and control stores&apos; comparability before the contest can&apos;t be fully verified.
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {reportError ? `${reportError} Try regenerating.` : regeneratingReport ? "Working out whether this contest is working…" : "No report yet — try regenerating."}
          </p>
        )}
      </div>

      <Disclosure summary="supporting evidence">
        <div className="flex justify-end">
          <ComparisonToggle basis={basis} onChange={setBasis} />
        </div>
        {evidenceOrder(diagnosis?.verdict).map((key, i) => (
          <div key={key} className={i > 0 ? "border-t border-border pt-4" : undefined}>
            {i === 0 && evidenceRelevance(diagnosis?.verdict) && (
              <p className="mb-3 rounded-lg bg-input px-3 py-2 text-[11px] text-foreground">{evidenceRelevance(diagnosis?.verdict)}</p>
            )}
            {key === "byStatus" && (
              <div>
                <h4 className="text-xs font-semibold text-foreground">GMV growth by exact status</h4>
                <p className="mb-3 mt-1 text-[11px] text-muted-foreground">
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
            )}

            {key === "availability" && (
              <div>
                <h4 className="text-xs font-semibold text-foreground">Store availability vs sales growth</h4>
                <p className="mb-3 mt-1 text-[11px] text-muted-foreground">Each dot is one store that ran the campaign — does poor execution track with poor stock availability?</p>
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
            )}

            {key === "stockGmv" && <StockVsGmvScatter stores={report.stores} />}

            {key === "weeklyTrend" && (
              <div>
                <h4 className="text-xs font-semibold text-foreground">Sales, week by week — approved vs poor vs control</h4>
                <p className="mb-3 mt-1 text-[11px] text-muted-foreground">
                  If approved and poor are tracking control rather than pulling ahead of it, that&apos;s a demand-side story, not an execution one.
                </p>
                <GroupLegend />
                <div className="mt-3">
                  <WeeklyChart metric={gmvMetric} basis={basis} height={220} />
                </div>
              </div>
            )}
          </div>
        ))}
      </Disclosure>
    </div>
  );
}

type EvidenceKey = "byStatus" | "availability" | "stockGmv" | "weeklyTrend";

/** Which chart actually bears on the diagnosed cause goes first — showing
 * all three in a fixed order regardless of verdict is what made them feel
 * arbitrary. The availability scatter is dropped entirely outside the supply
 * verdicts: when stock is fine (which is exactly when it's not the lead
 * cause), every store clusters at the high end of the x-axis and the chart
 * shows nothing. weeklyTrend (approved/poor/control side by side) is what
 * actually shows a demand/rubric story. */
function evidenceOrder(verdict?: DiagnosisVerdict): EvidenceKey[] {
  if (verdict === "not_working_supply_store" || verdict === "not_working_supply_warehouse") return ["availability", "byStatus", "stockGmv"];
  if (verdict === "not_working_rubric" || verdict === "not_working_demand") return ["weeklyTrend", "byStatus", "stockGmv"];
  if (verdict === "working" || verdict === "working_caveat") return ["stockGmv", "weeklyTrend", "byStatus"];
  return ["byStatus", "weeklyTrend", "stockGmv"];
}

function evidenceRelevance(verdict?: DiagnosisVerdict): string | null {
  switch (verdict) {
    case "not_working_supply_store":
    case "not_working_supply_warehouse":
      return "This is what the supply diagnosis is based on — low availability tracking with low growth is what rules this in as a stock problem, not an execution one.";
    case "not_working_rubric":
      return "This is the evidence behind the verdict above — poor/rejected stores are tracking about as fast as, or faster than, control despite not being approved.";
    case "not_working_demand":
      return "This is the evidence behind the verdict above — neither approved nor poor-execution stores are pulling ahead of control this month.";
    case "working":
    case "working_caveat":
      return "This is what confirms the lift reflects real conversion rather than just more stock on shelf.";
    default:
      return null;
  }
}

/** Plots stock on shelf against GMV, per store — makes the capacity ceiling
 * visible directly: a store far left simply didn't have enough stock to post
 * a high GMV, regardless of how well it executed. A reference line at the
 * overall median sell-through shows who's converting above or below par. */
function StockVsGmvScatter({ stores }: { stores: StoreRow[] }) {
  const points = stores.filter((s) => s.group !== "control" && s.inStoreValue != null && s.gmv != null);
  if (points.length < 2) return null;

  const sellThroughs = points.map((s) => s.sellThrough).filter((v): v is number => v != null).sort((a, b) => a - b);
  const medianSellThrough = sellThroughs.length ? sellThroughs[Math.floor(sellThroughs.length / 2)] : null;
  // sellThrough is stored as a % (0-100+); the reference line's geometry needs
  // the underlying raw ratio (GMV = stock × ratio), so convert back for the math only.
  const medianRatio = medianSellThrough != null ? medianSellThrough / 100 : null;

  const xVals = points.map((s) => s.inStoreValue!);
  const yVals = points.map((s) => s.gmv!);
  const xMax = Math.max(1, ...xVals) * 1.08;
  const yMax = Math.max(1, ...yVals) * 1.08;

  const W = 600, H = 280, PADX = 60, PADY = 20;
  const xFor = (v: number) => PADX + (v / xMax) * (W - PADX - 20);
  const yFor = (v: number) => H - PADY - (v / yMax) * (H - PADY * 2);

  const lineEndX = medianRatio != null && medianRatio > 0 ? Math.min(xMax, yMax / medianRatio) : 0;

  return (
    <div>
      <h4 className="text-xs font-semibold text-foreground">Stock on shelf vs GMV</h4>
      <p className="mb-3 mt-1 text-[11px] text-muted-foreground">
        Each dot is one store. The dashed line is the group&apos;s median sell-through — above it converts better than typical, below it converts
        worse; far left means low GMV is a stock ceiling, not necessarily poor execution.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        <line x1={PADX} x2={W - 10} y1={H - PADY} y2={H - PADY} stroke="var(--color-border)" strokeWidth={1} />
        <line x1={PADX} x2={PADX} y1={10} y2={H - PADY} stroke="var(--color-border)" strokeWidth={1} />
        {medianRatio != null && (
          <line x1={xFor(0)} y1={yFor(0)} x2={xFor(lineEndX)} y2={yFor(lineEndX * medianRatio)} stroke="var(--color-warning)" strokeDasharray="6 4" strokeWidth={1.5} />
        )}
        <text x={PADX - 8} y={16} fontSize={10} textAnchor="end" fill="var(--color-muted-foreground)">{fmtINR(yMax)}</text>
        <text x={PADX - 8} y={H - PADY} fontSize={10} textAnchor="end" fill="var(--color-muted-foreground)">₹0</text>
        <text x={PADX} y={H - 4} fontSize={10} fill="var(--color-muted-foreground)">₹0 stock</text>
        <text x={W - 10} y={H - 4} fontSize={10} textAnchor="end" fill="var(--color-muted-foreground)">{fmtINR(xMax)} stock</text>
        {points.map((s) => (
          <circle
            key={s.storeId}
            cx={xFor(s.inStoreValue!)}
            cy={yFor(s.gmv!)}
            r={5}
            fill={GROUP_COLOR[s.group]}
            opacity={0.8}
          >
            <title>{`${s.storeName}: ${fmtINR(s.inStoreValue)} stock, ${fmtINR(s.gmv)} GMV, ${s.sellThrough == null ? "no sell-through data" : `${s.sellThrough.toFixed(1)}% sell-through`}`}</title>
          </circle>
        ))}
      </svg>
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
  aiReport,
}: {
  campaigns: CampaignOption[];
  months: string[];
  campaignKey: string | null;
  month: string | null;
  report: ContestMonthReport | null;
  aiReport: ContestReport | { error: string } | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeSection, setActiveSection] = useState<View>("summary");
  const [chatOpen, setChatOpen] = useState(false);
  const campaignMonthKey = `${campaignKey ?? ""}:${month ?? ""}`;

  // Same keyed-override pattern used elsewhere: a regenerated report
  // overrides the server-provided one only for the campaign/month it was
  // generated for, so switching campaign or month falls straight back to
  // the server value instead of showing a stale override.
  const [reportOverride, setReportOverride] = useState<{ key: string; result: ContestReport | { error: string } } | null>(null);
  const [regeneratingReport, setRegeneratingReport] = useState(false);
  const aiReportState = reportOverride && reportOverride.key === campaignMonthKey ? reportOverride.result : aiReport;

  function handleRegenerateReport() {
    if (!campaignKey || !month) return;
    setRegeneratingReport(true);
    startTransition(async () => {
      const result = await regenerateContestReport(campaignKey, month);
      setReportOverride({ key: campaignMonthKey, result });
      setRegeneratingReport(false);
    });
  }

  function navigate(next: { campaign?: string | null; month?: string | null }) {
    const params = new URLSearchParams();
    const campaign = next.campaign !== undefined ? next.campaign : campaignKey;
    const m = next.month !== undefined ? next.month : month;
    if (campaign) params.set("campaign", campaign);
    if (m) params.set("month", m);
    setActiveSection("summary");
    window.scrollTo({ top: 0 });
    startTransition(() => router.replace(`/contest-impact?${params.toString()}`, { scroll: false }));
  }

  function scrollToSection(v: View) {
    document.getElementById(`sec-${v}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Real scrollspy: highlights whichever section is actually in view as the
  // page scrolls, not just whichever was last clicked.
  useEffect(() => {
    if (!report) return;
    const sections = (Object.keys(VIEW_LABELS) as View[])
      .map((v) => document.getElementById(`sec-${v}`))
      .filter((el): el is HTMLElement => el != null);
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveSection(visible[0].target.id.replace("sec-", "") as View);
      },
      { rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [report]);

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
        <div className="mt-4 flex items-start gap-6">
          <nav className="sticky top-4 hidden w-40 shrink-0 self-start lg:block">
            <p className="mb-2 pl-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">On this page</p>
            <div className="space-y-0.5">
              {(Object.keys(VIEW_LABELS) as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => scrollToSection(v)}
                  className={cn(
                    "block w-full rounded-lg border-l-2 px-3 py-1.5 text-left text-xs font-medium transition-colors",
                    activeSection === v ? "border-primary bg-primary/5 text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
          </nav>

          <div className="min-w-0 flex-1 space-y-10">
            <section id="sec-summary" className="scroll-mt-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{VIEW_LABELS.summary}</h2>
              <SummaryView report={report} onNavigateToStores={() => scrollToSection("stores")} />
            </section>

            <section id="sec-metrics" className="scroll-mt-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{VIEW_LABELS.metrics}</h2>
              <MetricsView report={report} />
            </section>

            <section id="sec-stores" className="scroll-mt-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{VIEW_LABELS.stores}</h2>
              <StoresView report={report} />
            </section>

            <section id="sec-execution" className="scroll-mt-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{VIEW_LABELS.execution}</h2>
              <IsItWorkingView
                report={report}
                aiReport={aiReportState}
                onRegenerateReport={handleRegenerateReport}
                regeneratingReport={regeneratingReport}
                onOpenChat={() => setChatOpen(true)}
              />
            </section>
          </div>
        </div>
      )}

      {report && campaignKey && month && (
        <ChatPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          campaignKey={campaignKey}
          campaignLabel={campaigns.find((c) => c.key === campaignKey)?.label ?? campaignKey}
          month={month}
        />
      )}
    </div>
  );
}
