"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SelectSearch } from "@/core/ui/select-search";
import { cn } from "@/core/lib/utils";
import { SELL_METRICS } from "../types";
import type { CampaignOption, ContestMonthReport, GrowthStat, SellMetricKey, SkuStockRow } from "../types";

const selectClass =
  "h-11 rounded-xl border border-transparent bg-input px-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none";

// ==================== formatting ====================

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  const rounded = Math.round(v * 10) / 10;
  if (rounded === 0) return "0.0%";
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}
function fmtPp(v: number | null): string {
  if (v == null) return "—";
  const rounded = Math.round(v * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}pp`;
}
function fmtLevel(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}
function pctColor(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted-foreground";
}
function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

function statusStyle(status: string | null): { dot: string; text: string } {
  if (!status) return { dot: "bg-muted-foreground", text: "text-muted-foreground" };
  const s = status.trim().toLowerCase();
  if (s === "approved") return { dot: "bg-success", text: "text-success" };
  if (s.includes("half") || s.includes("pending")) return { dot: "bg-warning", text: "text-warning" };
  if (s.includes("reject") || s.includes("decline")) return { dot: "bg-danger", text: "text-danger" };
  return { dot: "bg-muted-foreground", text: "text-muted-foreground" };
}

// ==================== small SVG chart helpers ====================

const CW = 100; // viewBox units — scales responsively via the parent width
const CH = 34;
const PAD = 3;

function scaleSeries(values: (number | null)[][]): { min: number; max: number } {
  const all = values.flat().filter((v): v is number => v != null);
  if (!all.length) return { min: 0, max: 1 };
  let min = Math.min(0, ...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return { min, max };
}

function toPoints(values: (number | null)[], min: number, max: number, w = CW, h = CH, pad = PAD): { x: number; y: number }[] {
  const n = values.length;
  const stepX = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const range = max - min || 1;
  const pts: { x: number; y: number }[] = [];
  values.forEach((v, i) => {
    if (v == null) return;
    pts.push({ x: pad + i * stepX, y: h - pad - ((v - min) / range) * (h - pad * 2) });
  });
  return pts;
}

function Sparkline({ contest, control }: { contest: (number | null)[]; control: (number | null)[] }) {
  const { min, max } = scaleSeries([contest, control]);
  const cPts = toPoints(contest, min, max);
  const gPts = toPoints(control, min, max);
  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} className="h-9 w-full" preserveAspectRatio="none">
      {gPts.length > 0 && (
        <polyline points={gPts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--color-muted-foreground)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      )}
      {cPts.length > 0 && (
        <polyline points={cPts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--color-primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

/** A bigger contest-vs-control line chart with a week axis and value labels
 * on the last point of each line. */
function WeekLineChart({
  weeks,
  contest,
  control,
  fmt = fmtPct,
}: {
  weeks: number[];
  contest: (number | null)[];
  control: (number | null)[];
  fmt?: (v: number | null) => string;
}) {
  const W = 560, H = 200, PADX = 36, PADY = 24;
  const { min, max } = scaleSeries([contest, control]);
  const cPts = toPoints(contest, min, max, W, H, PADX);
  const gPts = toPoints(control, min, max, W, H, PADY);
  const zeroY = H - PADY - ((0 - min) / (max - min || 1)) * (H - PADY * 2);
  const lastC = cPts[cPts.length - 1];
  const lastG = gPts[gPts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      {min < 0 && max > 0 && (
        <line x1={PADX} x2={W - PADX} y1={zeroY} y2={zeroY} stroke="var(--color-border)" strokeDasharray="3 3" />
      )}
      {weeks.map((w, i) => {
        const x = PADX + (weeks.length > 1 ? i * ((W - PADX * 2) / (weeks.length - 1)) : 0);
        return (
          <text key={w} x={x} y={H - 4} fontSize={10} textAnchor="middle" fill="var(--color-muted-foreground)">
            Week {w}
          </text>
        );
      })}
      {gPts.length > 0 && (
        <polyline points={gPts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--color-muted-foreground)" strokeWidth={2} />
      )}
      {gPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--color-muted-foreground)" />
      ))}
      {cPts.length > 0 && (
        <polyline points={cPts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--color-primary)" strokeWidth={2.5} />
      )}
      {cPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="var(--color-primary)" />
      ))}
      {lastC && (
        <text x={lastC.x} y={lastC.y - 8} fontSize={11} fontWeight={700} textAnchor="middle" fill="var(--color-primary)">
          {fmt(contest[contest.length - 1])}
        </text>
      )}
      {lastG && (
        <text x={lastG.x} y={lastG.y + 16} fontSize={11} fontWeight={700} textAnchor="middle" fill="var(--color-muted-foreground)">
          {fmt(control[control.length - 1])}
        </text>
      )}
    </svg>
  );
}

function GapBarChart({ weeks, gaps }: { weeks: number[]; gaps: (number | null)[] }) {
  const W = 560, H = 140, PADX = 30, PADY = 20;
  const vals = gaps.filter((v): v is number => v != null);
  const maxAbs = Math.max(1, ...vals.map((v) => Math.abs(v)));
  const barW = (W - PADX * 2) / weeks.length / 2;
  const zeroY = H - PADY;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <line x1={PADX} x2={W - PADX} y1={zeroY} y2={zeroY} stroke="var(--color-border)" />
      {weeks.map((w, i) => {
        const g = gaps[i];
        const cx = PADX + (i + 0.5) * ((W - PADX * 2) / weeks.length);
        const barH = g == null ? 0 : (Math.abs(g) / maxAbs) * (H - PADY * 2 - 16);
        const y = g == null ? zeroY : g >= 0 ? zeroY - barH : zeroY;
        return (
          <g key={w}>
            <rect
              x={cx - barW / 2}
              y={y}
              width={barW}
              height={Math.max(1, barH)}
              rx={2}
              fill={g == null ? "var(--color-muted-foreground)" : g >= 0 ? "var(--color-success)" : "var(--color-danger)"}
            />
            <text x={cx} y={g != null && g >= 0 ? y - 6 : zeroY + 14} fontSize={11} fontWeight={700} textAnchor="middle" fill="var(--color-foreground)">
              {fmtPp(g)}
            </text>
            <text x={cx} y={H - 4} fontSize={10} textAnchor="middle" fill="var(--color-muted-foreground)">
              Week {w}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DailyLineChart({ points }: { points: { day: string; fillRate: number | null }[] }) {
  const W = 640, H = 180, PADX = 8, PADY = 20;
  const values = points.map((p) => p.fillRate);
  const { min, max } = scaleSeries([values, [100]]);
  const pts = toPoints(values, min, max, W, H, PADY);
  const targetY = H - PADY - ((100 - min) / (max - min || 1)) * (H - PADY * 2);
  const pathIdx = [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <line x1={PADX} x2={W - PADX} y1={targetY} y2={targetY} stroke="var(--color-warning)" strokeDasharray="4 4" />
      <text x={W - PADX} y={targetY - 4} fontSize={10} textAnchor="end" fill="var(--color-warning)">
        100% target
      </text>
      {pts.length > 0 && (
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--color-primary)" strokeWidth={2} />
      )}
      {pathIdx.map((i) => {
        const p = pts[i];
        const pt = points[i];
        if (!p || !pt) return null;
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={2.5} fill="var(--color-primary)" />
            <text x={p.x} y={H - 4} fontSize={10} textAnchor="middle" fill="var(--color-muted-foreground)">
              {fmtDay(pt.day)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DivergingBarChart({ rows }: { rows: { label: string; value: number | null }[] }) {
  const W = 640;
  const rowH = 26;
  const H = rows.length * rowH + 10;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.value ?? 0)));
  const midX = W / 2;
  const usable = W / 2 - 90;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <line x1={midX} x2={midX} y1={0} y2={H} stroke="var(--color-border)" />
      {rows.map((r, i) => {
        const y = i * rowH + rowH / 2;
        const w = r.value == null ? 0 : (Math.abs(r.value) / maxAbs) * usable;
        const positive = (r.value ?? 0) >= 0;
        return (
          <g key={r.label}>
            <text x={midX - 96} y={y + 4} fontSize={11} textAnchor="end" fill="var(--color-foreground)">
              {r.label.length > 26 ? r.label.slice(0, 25) + "…" : r.label}
            </text>
            <rect
              x={positive ? midX : midX - w}
              y={y - 7}
              width={w}
              height={14}
              rx={3}
              fill={positive ? "var(--color-success)" : "var(--color-danger)"}
            />
            <text x={positive ? midX + w + 6 : midX - w - 6} y={y + 4} fontSize={11} fontWeight={700} textAnchor={positive ? "start" : "end"} fill="var(--color-foreground)">
              {fmtPct(r.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ==================== metric comparison table ====================

function MetricTable({
  title,
  subtitle,
  rows,
  pick,
}: {
  title: string;
  subtitle: string;
  rows: { key: SellMetricKey; label: string; stat: GrowthStat }[];
  pick: "vsLastMonth" | "vsLastYear";
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mb-3 mt-1 text-xs text-muted-foreground">{subtitle}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2 text-left font-semibold">Metric</th>
              <th className="px-2 py-2 text-right font-semibold">Contest</th>
              <th className="px-2 py-2 text-right font-semibold">Control</th>
              <th className="px-2 py-2 text-right font-semibold">Gap</th>
              <th className="px-2 py-2 text-right font-semibold">Obs.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0">
                <td className="px-2 py-2">{r.label}</td>
                <td className={cn("px-2 py-2 text-right tabular-nums", pctColor(r.stat.contest))}>{fmtPct(r.stat.contest)}</td>
                <td className={cn("px-2 py-2 text-right tabular-nums", pctColor(r.stat.control))}>{fmtPct(r.stat.control)}</td>
                <td className={cn("px-2 py-2 text-right font-semibold tabular-nums", pctColor(r.stat.gapPct))}>{fmtPp(r.stat.gapPct)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                  {r.stat.contestN}
                  {pick === "vsLastYear" && r.stat.contestN > 0 && r.stat.contestN < 6 && (
                    <span className="ml-1 rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">thin</span>
                  )}
                  {" / "}
                  {r.stat.controlN}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== views ====================

type View = "summary" | "sales" | "weeks" | "stores" | "stock";

function SummaryView({ report, onNavigate }: { report: ContestMonthReport; onNavigate: (v: View) => void }) {
  const { verdict, weeklySales } = report;
  const gmvContestSeries = weeklySales.map((w) => w.metrics.gmv.vsLastMonth.contest);
  const gmvControlSeries = weeklySales.map((w) => w.metrics.gmv.vsLastMonth.control);
  const stockSeries = report.dailyStock.map((d) => d.fillRate);

  const week1Gap =
    verdict.week1ContestGmvGrowth != null && verdict.week1ControlGmvGrowth != null
      ? verdict.week1ContestGmvGrowth - verdict.week1ControlGmvGrowth
      : null;

  const lastYearThin = report.lastYear.contestStoresTotal > 0 && report.lastYear.contestStoresWithData < report.lastYear.contestStoresTotal / 2;

  const cards: { view: View; title: string; note: string; sparkline: React.ReactNode }[] = [
    {
      view: "sales",
      title: "Sales impact",
      note: `GMV gap vs last month${lastYearThin ? " · also holds vs last July, on thinner data" : ""}`,
      sparkline: <Sparkline contest={gmvContestSeries} control={gmvControlSeries} />,
    },
    {
      view: "weeks",
      title: "Week by week",
      note: week1Gap != null ? `Week 1 gap ${fmtPp(week1Gap)} → final ${fmtPp(verdict.gapPct)}` : "Weekly trend",
      sparkline: <Sparkline contest={gmvContestSeries} control={gmvControlSeries} />,
    },
    {
      view: "stores",
      title: "Store performance",
      note: `${verdict.contestStoreCount} contest stores ranked by GMV growth`,
      sparkline: (
        <Sparkline
          contest={report.stores.filter((s) => s.group === "contest").map((s) => s.gmvGrowthVsLastMonth)}
          control={[]}
        />
      ),
    },
    {
      view: "stock",
      title: "Stock health",
      note: "Daily store fill rate against target",
      sparkline: <Sparkline contest={stockSeries} control={[]} />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verdict</span>
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
            {verdict.contestStoreCount} contest stores · medium confidence
          </span>
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
          <span className={pctColor(verdict.gapPct)}>{fmtPp(verdict.gapPct)}</span> GMV lift over the control group
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Stores running the display grew <b className={pctColor(verdict.contestGmvGrowth)}>{fmtPct(verdict.contestGmvGrowth)}</b> against
          last month. Stores that never ran it were{" "}
          <b className={pctColor(verdict.controlGmvGrowth)}>{fmtPct(verdict.controlGmvGrowth)}</b>.{" "}
          {week1Gap != null && Math.abs(week1Gap) < Math.abs(verdict.gapPct ?? 0) / 2 && (
            <>In week 1 the two groups were within {fmtPp(week1Gap)} of each other — the gap opened only once the display went up.</>
          )}
        </p>
        {verdict.contestStoreCount > 0 && verdict.contestStoreCount < 15 && (
          <p className="mt-2 text-xs text-muted-foreground">
            With only {verdict.contestStoreCount} contest stores, treat this as directional rather than statistically conclusive.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.view}
            type="button"
            onClick={() => onNavigate(c.view)}
            className="rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary"
          >
            <p className="text-sm font-semibold text-foreground">{c.title}</p>
            <div className="my-2">{c.sparkline}</div>
            <p className="text-xs text-muted-foreground">{c.note}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function SalesView({ report }: { report: ContestMonthReport }) {
  const weeks = report.weeklySales.map((w) => w.week);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Every metric, week over week</h3>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">Contest (red) vs control (grey), % growth vs last month.</p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {SELL_METRICS.map((m) => (
            <div key={m.key} className="rounded-xl border border-border bg-background p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{m.label}</p>
              <WeekLineChart
                weeks={weeks}
                contest={report.weeklySales.map((w) => w.metrics[m.key].vsLastMonth.contest)}
                control={report.weeklySales.map((w) => w.metrics[m.key].vsLastMonth.control)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Pooled across all four weeks</h3>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <MetricTable
            title="Pooled — vs last month"
            subtitle="Median growth across every store-week observation this month."
            pick="vsLastMonth"
            rows={SELL_METRICS.map((m) => ({ key: m.key, label: m.label, stat: report.pooledSales[m.key].vsLastMonth }))}
          />
          <MetricTable
            title="Same month last year"
            subtitle="Compares to last July, so seasonality can't explain the gap the way it might month-on-month."
            pick="vsLastYear"
            rows={SELL_METRICS.map((m) => ({ key: m.key, label: m.label, stat: report.pooledSales[m.key].vsLastYear }))}
          />
        </div>
        {report.lastYear.contestStoresTotal > 0 && report.lastYear.contestStoresWithData < report.lastYear.contestStoresTotal && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
            <p>
              Every contest-side &quot;same month last year&quot; figure above comes from just {report.lastYear.contestStoresWithData} of{" "}
              {report.lastYear.contestStoresTotal} contest stores ({report.lastYear.storeNames.join(", ") || "none"}). The other{" "}
              {report.lastYear.contestStoresTotal - report.lastYear.contestStoresWithData} have no last-year rows at all — treat this
              column as a sanity check, not a second verdict.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function WeeksView({ report }: { report: ContestMonthReport }) {
  const weeks = report.weeklySales.map((w) => w.week);
  const contest = report.weeklySales.map((w) => w.metrics.gmv.vsLastMonth.contest);
  const control = report.weeklySales.map((w) => w.metrics.gmv.vsLastMonth.control);
  const gaps = report.weeklySales.map((w) => w.metrics.gmv.vsLastMonth.gapPct);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">GMV growth, week by week</h3>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">Contest (red) vs control (grey), % vs last month.</p>
        <WeekLineChart weeks={weeks} contest={contest} control={control} />
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">The gap, isolated</h3>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">Contest GMV growth minus control GMV growth, in percentage points.</p>
        <GapBarChart weeks={weeks} gaps={gaps} />
      </div>
    </div>
  );
}

function StoresView({ report }: { report: ContestMonthReport }) {
  const contestStores = report.stores.filter((s) => s.group === "contest");
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Ranked by GMV growth vs last month</h3>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">Contest stores only — {contestStores.length} stores.</p>
        <DivergingBarChart rows={contestStores.map((s) => ({ label: s.storeName, value: s.gmvGrowthVsLastMonth }))} />
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5 pb-3">
          <h3 className="text-sm font-semibold text-foreground">Store-level detail</h3>
          <p className="mt-1 text-xs text-muted-foreground">Status shown per week, exactly as Campaign Data recorded it.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 text-left font-semibold">Store</th>
                <th className="px-4 py-2 text-left font-semibold">Status by week</th>
                <th className="px-4 py-2 text-right font-semibold">GMV vs LM</th>
                <th className="px-4 py-2 text-right font-semibold">GMV vs LY</th>
                <th className="px-4 py-2 text-right font-semibold">Store fill</th>
                <th className="px-4 py-2 text-right font-semibold">On target</th>
              </tr>
            </thead>
            <tbody>
              {report.stores.map((s) => (
                <tr key={s.storeId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    {s.storeName}
                    {s.group === "control" && (
                      <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        control
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {s.group === "control" ? (
                      <span className="text-xs text-muted-foreground">no contest</span>
                    ) : (
                      <div className="flex gap-1">
                        {s.statusByWeek.map((sw) => {
                          const style = statusStyle(sw.status);
                          return (
                            <span
                              key={sw.week}
                              title={`Week ${sw.week}: ${sw.status ?? "no row"}`}
                              className={cn("h-2.5 w-2.5 rounded-full", style.dot)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className={cn("px-4 py-2 text-right tabular-nums", pctColor(s.gmvGrowthVsLastMonth))}>{fmtPct(s.gmvGrowthVsLastMonth)}</td>
                  <td className={cn("px-4 py-2 text-right tabular-nums", s.hasLastYearData ? pctColor(s.gmvGrowthVsLastYear) : "text-muted-foreground")}>
                    {s.hasLastYearData ? fmtPct(s.gmvGrowthVsLastYear) : "no data"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtLevel(s.storeStockFillRate)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtLevel(s.storeSkuOnTargetPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ShortfallTable({ rows }: { rows: SkuStockRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 text-left font-semibold">SKU</th>
            <th className="px-4 py-2 text-right font-semibold">Store shortfall</th>
            <th className="px-4 py-2 text-right font-semibold">Central warehouse</th>
            <th className="px-4 py-2 text-right font-semibold">Cover multiple</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.skuName} className="border-b border-border last:border-0">
              <td className="px-4 py-2">{r.skuName}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.shortfallUnits != null ? Math.round(r.shortfallUnits) : "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.warehouseUnits != null ? Math.round(r.warehouseUnits) : "—"}</td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums">
                {r.shortfallUnits === 0 ? (
                  <span className="text-success">no shortfall</span>
                ) : r.coverMultiple != null ? (
                  `${r.coverMultiple.toFixed(1)}×`
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StockView({ report }: { report: ContestMonthReport }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Daily store stock fill rate</h3>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">
          Sum of in-store stock ÷ sum of target, across all contest stores and SKUs, per day.
        </p>
        <DailyLineChart points={report.dailyStock} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Per SKU, this month</h3>
        <div className="mt-3 space-y-3">
          {report.skuStock.map((s) => (
            <div key={s.skuName}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">{s.skuName}</span>
                <span className="text-muted-foreground">
                  {fmtLevel(s.avgFillRate)} avg fill · {fmtLevel(s.onTargetPct)} of days on target
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, s.avgFillRate ?? 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5 pb-3">
          <h3 className="text-sm font-semibold text-foreground">Can we cover the shortfall?</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Store shortfall = units short of target, summed across every store and day. Central warehouse is a single shared pool, not
            per-store — treat &quot;cover multiple&quot; as a rough capacity check, not a fill rate.
          </p>
        </div>
        <ShortfallTable rows={report.skuStock} />
      </div>
    </div>
  );
}

// ==================== shell ====================

const VIEW_LABELS: Record<View, string> = {
  summary: "Summary",
  sales: "Sales impact",
  weeks: "Week by week",
  stores: "Store performance",
  stock: "Stock health",
};

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
          <p className="mt-1 text-sm text-muted-foreground">Contest stores against a control group that never ran the display.</p>
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
          {view !== "summary" && (
            <button
              type="button"
              onClick={() => setView("summary")}
              className="mb-4 mt-4 text-sm font-medium text-primary hover:underline"
            >
              ← Back to summary
            </button>
          )}
          {view === "summary" && <div className="mt-6"><SummaryView report={report} onNavigate={setView} /></div>}
          {view !== "summary" && (
            <>
              <div className="mb-4 flex w-fit rounded-xl border border-border bg-input p-0.5">
                {(Object.keys(VIEW_LABELS) as View[])
                  .filter((v) => v !== "summary")
                  .map((v) => (
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
              {view === "sales" && <SalesView report={report} />}
              {view === "weeks" && <WeeksView report={report} />}
              {view === "stores" && <StoresView report={report} />}
              {view === "stock" && <StockView report={report} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
