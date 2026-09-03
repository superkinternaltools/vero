"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Maximize2, MessageCircle } from "lucide-react";
import { SelectSearch } from "@/core/ui/select-search";
import { Modal } from "@/core/ui/modal";
import { cn } from "@/core/lib/utils";
import { SELL_METRICS, GROUP_LABELS } from "../types";
import { ChatPanel } from "./chat-panel";
import type {
  CampaignOption,
  ComparisonBasis,
  ContestGroup,
  ContestMonthReport,
  MetricKind,
  MetricSeries,
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

type View = "summary" | "metrics" | "stores";
const VIEW_LABELS: Record<View, string> = { summary: "Summary", metrics: "Detailed metrics", stores: "Store performance" };

function SummaryView({ report }: { report: ContestMonthReport }) {
  return (
    <div className="space-y-4">
      <InventorySummarySection report={report} />
      <FullDataTable report={report} />
      <WeeklySplitCard report={report} />
    </div>
  );
}

/** The approved/poor pool reshuffles week to week as verdicts change —
 * control isn't part of this pool, and this is the only place that shows
 * the week-by-week movement rather than just the latest snapshot. */
function WeeklySplitCard({ report }: { report: ContestMonthReport }) {
  const splitRows = report.weeklyGroupCounts.map((w) => ({ week: w.week, approved: w.approved, poor: w.poor, total: w.approved + w.poor }));
  const showSplit = splitRows.some((r) => r.total > 0);
  if (!showSplit) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Approved ⇄ poor, week by week</h3>
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
      <StockPushComparison report={report} />
    </div>
  );
}

/** Raw GMV alone can't tell you whether approved stores actually converted
 * better, or just held more stock — a store with 3x the stock will often
 * post higher GMV even with mediocre execution. These are the three numbers
 * that isolate that: how much more (or less) approved sold, how much more
 * (or less) stock it carried to get there, and sell-through (GMV per rupee
 * of stock) — the one that's actually apples-to-apples regardless of how
 * much stock either group had. Shown against both other groups since a
 * stock-driven story can show up against one and not the other. */
function StockPushComparison({ report }: { report: ContestMonthReport }) {
  const gmv = report.metrics.find((m) => m.key === "gmv");
  const stock = report.metrics.find((m) => m.key === "inStoreValue");
  const sellThrough = report.metrics.find((m) => m.key === "sellThrough");
  if (!gmv || !stock || !sellThrough) return null;

  const gmvA = gmv.monthAvg.approved;
  const stockA = stock.monthAvg.approved;
  const stA = sellThrough.monthAvg.approved;

  const groups: { label: string; group: ContestGroup }[] = [
    { label: "vs Control Group", group: "control" },
    { label: "vs Poor Group", group: "poor" },
  ];

  return (
    <div className="m-4 mt-3 grid gap-3 sm:grid-cols-2">
      {groups.map(({ label, group }) => {
        const gmvOther = gmv.monthAvg[group];
        const stockOther = stock.monthAvg[group];
        const stOther = sellThrough.monthAvg[group];
        const gmvRatio = gmvA != null && gmvOther ? gmvA / gmvOther : null;
        const stockRatio = stockA != null && stockOther ? stockA / stockOther : null;
        return (
          <div key={group} className="rounded-xl bg-input p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <div className="mt-2 space-y-1.5">
              <StockPushStatRow label="GMV" value={gmvRatio != null ? `${gmvRatio.toFixed(1)}×` : "no data"} />
              <StockPushStatRow label="In-store value" value={stockRatio != null ? `${stockRatio.toFixed(1)}×` : "no data"} />
              <StockPushStatRow
                label="Sell-through"
                value={stA != null && stOther != null ? `${fmtPercent(stA)} vs ${fmtPercent(stOther)}` : "no data"}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StockPushStatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
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
    </div>
  );
}

function StoresView({ report }: { report: ContestMonthReport }) {
  const [basis, setBasis] = useState<ComparisonBasis>("lastMonth");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<Set<ContestGroup>>(new Set(["approved", "poor", "control"]));

  function toggleGroup(g: ContestGroup) {
    setGroupFilter((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  const groupOrder: Record<ContestGroup, number> = { approved: 0, poor: 1, control: 2 };
  const sorted = [...report.stores]
    .filter((s) => groupFilter.has(s.group))
    .filter((s) => s.storeName.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
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
      <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search store…"
          className="h-9 min-w-[180px] flex-1 rounded-lg border border-transparent bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none"
        />
        <div className="flex gap-1.5">
          {(["approved", "poor", "control"] as ContestGroup[]).map((g) => {
            const active = groupFilter.has(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGroup(g)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  active ? "border-transparent text-background" : "border-border text-muted-foreground hover:text-foreground",
                )}
                style={active ? { background: GROUP_COLOR[g] } : undefined}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? "var(--color-background)" : GROUP_COLOR[g] }} />
                {GROUP_LABELS[g]}
              </button>
            );
          })}
        </div>
      </div>
      {sorted.length === 0 && (
        <p className="border-t border-border p-6 text-center text-xs text-muted-foreground">No stores match these filters.</p>
      )}
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
  const [navPending, startTransition] = useTransition();
  const [activeSection, setActiveSection] = useState<View>("summary");
  const [chatOpen, setChatOpen] = useState(false);

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
        <div className="flex flex-wrap items-center gap-2">
          {navPending && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              Loading…
            </span>
          )}
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
          {report && campaignKey && month && (
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-transparent bg-input px-3 text-xs font-medium text-foreground transition-colors hover:border-primary"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Chat with Vero
            </button>
          )}
        </div>
      </div>

      {!report && (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No contest data yet for this selection. Import a sheet first.
        </div>
      )}

      {report && (
        <div className={cn("mt-4 flex items-start gap-6 transition-opacity", navPending && "pointer-events-none opacity-50")}>
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
              <SummaryView report={report} />
            </section>

            <section id="sec-metrics" className="scroll-mt-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{VIEW_LABELS.metrics}</h2>
              <MetricsView report={report} />
            </section>

            <section id="sec-stores" className="scroll-mt-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{VIEW_LABELS.stores}</h2>
              <StoresView report={report} />
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
