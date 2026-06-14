"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";
import { MultiSelect } from "@/core/ui/multi-select";
import { cn } from "@/core/lib/utils";
import { fetchPersonBreakdown } from "../actions";
import type {
  AnalysisThresholds,
  OverviewTotals,
  CampaignOverviewRow,
  TrendSeries,
  StoreAnalysisRow,
  PersonAnalysisRow,
  AiAnalysisData,
} from "../queries";

const CHART_COLORS = [
  "#b91c1c",
  "#2563eb",
  "#15803d",
  "#d97706",
  "#7c3aed",
  "#0891b2",
];

type Tab = "overview" | "stores" | "people" | "ai";
type SortDir = "asc" | "desc";

function pctBadgeClass(val: number, t: AnalysisThresholds): string {
  if (val >= t.onTrack) return "bg-success/10 text-success";
  if (val >= t.needs) return "bg-warning/10 text-warning";
  return "bg-danger/10 text-danger";
}

function PctBadge({ val, t }: { val: number; t: AnalysisThresholds }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        pctBadgeClass(val, t),
      )}
    >
      {val}%
    </span>
  );
}

function MetricCard({
  label,
  value,
  sub,
  colorClass,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-2 text-3xl font-bold", colorClass ?? "text-foreground")}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function TrendChart({ series }: { series: TrendSeries[] }) {
  if (!series.length || !series[0]?.points.length) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No data for this period.
      </p>
    );
  }

  const labels = series[0].points.map((p) => p.label);
  const n = labels.length;
  const W = 560, H = 120, PADL = 32, PADT = 8;
  const toX = (i: number) =>
    n === 1 ? PADL + W / 2 : PADL + (i / (n - 1)) * W;
  const toY = (v: number) => PADT + H - (v / 100) * H;

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W + PADL + 16} ${H + PADT + 28}`}
          className="w-full min-w-[320px]"
        >
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line
                x1={PADL}
                y1={toY(v)}
                x2={PADL + W}
                y2={toY(v)}
                stroke="currentColor"
                strokeOpacity=".08"
                strokeWidth="1"
              />
              <text
                x={PADL - 4}
                y={toY(v) + 4}
                textAnchor="end"
                fontSize="9"
                fill="currentColor"
                fillOpacity=".5"
              >
                {v}%
              </text>
            </g>
          ))}

          {labels.map((lbl, i) => (
            <text
              key={i}
              x={toX(i)}
              y={H + PADT + 18}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
              fillOpacity=".6"
            >
              {lbl}
            </text>
          ))}

          {series.map((s, si) => {
            const color = CHART_COLORS[si % CHART_COLORS.length];
            const pts = s.points
              .map((p, i) => `${toX(i)},${toY(p.submissionPct)}`)
              .join(" ");
            return (
              <g key={s.campaignId}>
                <polyline
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={pts}
                />
                {s.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={toX(i)}
                    cy={toY(p.submissionPct)}
                    r="3"
                    fill={color}
                  >
                    <title>
                      {s.campaignName} · {p.label}: {p.submissionPct}% submitted
                      ({p.assigned} tasks)
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        {series.map((s, si) => (
          <div
            key={s.campaignId}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="inline-block h-2 w-5 rounded-full"
              style={{ background: CHART_COLORS[si % CHART_COLORS.length] }}
            />
            {s.campaignName}
          </div>
        ))}
      </div>
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <Minus className="h-3 w-3 opacity-25" />;
  return dir === "asc" ? (
    <ChevronUp className="h-3 w-3" />
  ) : (
    <ChevronDown className="h-3 w-3" />
  );
}

function useSortedRows<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
  dir: SortDir,
): T[] {
  return useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[key], bv = b[key];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, key, dir]);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function presetRange(p: "this_month" | "last_month" | "last_3_months"): {
  from: string;
  to: string;
} {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const today = `${y}-${pad2(m + 1)}-${pad2(d)}`;
  if (p === "this_month") return { from: `${y}-${pad2(m + 1)}-01`, to: today };
  if (p === "last_month") {
    const ly = m === 0 ? y - 1 : y;
    const lm = m === 0 ? 11 : m - 1;
    const lastDay = new Date(y, m, 0).getDate();
    return {
      from: `${ly}-${pad2(lm + 1)}-01`,
      to: `${ly}-${pad2(lm + 1)}-${pad2(lastDay)}`,
    };
  }
  const d3 = new Date(y, m - 3, 1);
  return {
    from: `${d3.getFullYear()}-${pad2(d3.getMonth() + 1)}-01`,
    to: today,
  };
}

export function AnalysisClient({
  options,
  thresholds,
  overview,
  trend,
  storeBreakdown,
  personBreakdown: initPersonBreakdown,
  aiData,
  isAdmin,
  campaignIds: initCampaignIds,
  dateFrom: initFrom,
  dateTo: initTo,
  granularity: initGran,
  jobTitleId: initJobTitle,
}: {
  options: {
    campaigns: { id: string; name: string; status: string }[];
    jobTitles: { id: string; name: string }[];
  };
  thresholds: AnalysisThresholds;
  overview: { totals: OverviewTotals; byCampaign: CampaignOverviewRow[] };
  trend: TrendSeries[];
  storeBreakdown: StoreAnalysisRow[];
  personBreakdown: PersonAnalysisRow[];
  aiData: AiAnalysisData;
  isAdmin: boolean;
  campaignIds: string[];
  dateFrom: string;
  dateTo: string;
  granularity: "weekly" | "monthly";
  jobTitleId: string | null;
}) {
  const router = useRouter();

  const [selCampaigns, setSelCampaigns] = useState<string[]>(initCampaignIds);
  const [fromDate, setFromDate] = useState(initFrom);
  const [toDate, setToDate] = useState(initTo);
  const [gran, setGran] = useState<"weekly" | "monthly">(initGran);

  const [tab, setTab] = useState<Tab>("overview");

  const [selJobTitle, setSelJobTitle] = useState(initJobTitle ?? "");
  const [personRows, setPersonRows] = useState<PersonAnalysisRow[]>(initPersonBreakdown);
  const [personPending, startPersonTransition] = useTransition();

  const [storeSortKey, setStoreSortKey] = useState<keyof StoreAnalysisRow>("submissionPct");
  const [storeSortDir, setStoreSortDir] = useState<SortDir>("asc");
  const sortedStores = useSortedRows(storeBreakdown, storeSortKey, storeSortDir);

  function toggleStoreSort(key: keyof StoreAnalysisRow) {
    if (storeSortKey === key) {
      setStoreSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setStoreSortKey(key);
      setStoreSortDir("asc");
    }
  }

  function applyFilters() {
    const p = new URLSearchParams();
    if (selCampaigns.length) p.set("campaigns", selCampaigns.join(","));
    p.set("from", fromDate);
    p.set("to", toDate);
    if (gran === "monthly") p.set("gran", "monthly");
    if (selJobTitle) p.set("job_title", selJobTitle);
    router.push(`/analysis?${p.toString()}`);
  }

  function handleJobTitleChange(id: string) {
    setSelJobTitle(id);
    if (!id) {
      setPersonRows([]);
      return;
    }
    startPersonTransition(async () => {
      const rows = await fetchPersonBreakdown({
        campaignIds: selCampaigns,
        dateFrom: fromDate,
        dateTo: toDate,
        jobTitleId: id,
      });
      setPersonRows(rows);
    });
  }

  function setPreset(p: "this_month" | "last_month" | "last_3_months") {
    const { from, to } = presetRange(p);
    setFromDate(from);
    setToDate(to);
  }

  const campaignOpts = options.campaigns.map((c) => ({
    id: c.id,
    label: c.name,
  }));

  const thresholdNote = `Green ≥${thresholds.onTrack}% · Amber ≥${thresholds.needs}% · Red below (configurable in Settings)`;

  const { totals } = overview;
  const submissionColorClass =
    totals.submissionPct >= thresholds.onTrack
      ? "text-success"
      : totals.submissionPct >= thresholds.needs
        ? "text-warning"
        : "text-danger";
  const approvalColorClass =
    totals.approvalPct >= thresholds.onTrack
      ? "text-success"
      : totals.approvalPct >= thresholds.needs
        ? "text-warning"
        : "text-danger";
  const missedColorClass =
    totals.missedPct === 0
      ? "text-success"
      : totals.missedPct < 15
        ? "text-warning"
        : "text-danger";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Analysis
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {initFrom} → {initTo} ·{" "}
          {initCampaignIds.length > 0
            ? `${initCampaignIds.length} campaign${initCampaignIds.length === 1 ? "" : "s"} selected`
            : "All campaigns"}
        </p>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto_auto]">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Campaigns
            </p>
            <MultiSelect
              options={campaignOpts}
              selected={selCampaigns}
              onChange={setSelCampaigns}
              placeholder="All campaigns"
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              From
            </p>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-12 rounded-xl border border-transparent bg-input px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              To
            </p>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-12 rounded-xl border border-transparent bg-input px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Trend view
            </p>
            <select
              value={gran}
              onChange={(e) => setGran(e.target.value as "weekly" | "monthly")}
              className="h-12 rounded-xl border border-transparent bg-input px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <button
              onClick={applyFilters}
              className="h-12 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Quick:</span>
          {(
            [
              ["this_month", "This month"],
              ["last_month", "Last month"],
              ["last_3_months", "Last 3 months"],
            ] as const
          ).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className="rounded-full border border-border px-3 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex">
          {(
            [
              ["overview", "Overview"],
              ["stores", "By Store"],
              ["people", "By Person"],
              ["ai", "AI Quality"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 px-5 py-2.5 text-sm font-medium transition-colors",
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Tasks Assigned"
              value={totals.assigned.toLocaleString("en-IN")}
            />
            <MetricCard
              label="Submitted"
              value={totals.submitted.toLocaleString("en-IN")}
              sub={`${totals.submissionPct}% submission rate`}
              colorClass={submissionColorClass}
            />
            <MetricCard
              label="Approved"
              value={totals.approved.toLocaleString("en-IN")}
              sub={`${totals.approvalPct}% of submitted`}
              colorClass={approvalColorClass}
            />
            <MetricCard
              label="Missed"
              value={totals.missed.toLocaleString("en-IN")}
              sub={`${totals.missedPct}% of assigned`}
              colorClass={missedColorClass}
            />
          </div>

          {isAdmin && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Payout Committed
              </p>
              <p className="mt-2 text-3xl font-bold text-foreground">
                ₹{totals.payoutCommitted.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Approved tasks × campaign payout amount
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">
              Submission rate —{" "}
              {gran === "weekly" ? "week by week" : "month by month"}
            </h2>
            <TrendChart series={trend} />
          </div>

          {overview.byCampaign.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
                Campaign Comparison
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Campaign</th>
                    <th className="px-4 py-3 font-semibold">Assigned</th>
                    <th className="px-4 py-3 font-semibold">Submit %</th>
                    <th className="px-4 py-3 font-semibold">Approval %</th>
                    <th className="px-4 py-3 font-semibold">Missed %</th>
                    {isAdmin && (
                      <th className="px-4 py-3 font-semibold">Payout</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {overview.byCampaign.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        {c.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.assigned.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3">
                        <PctBadge val={c.submissionPct} t={thresholds} />
                      </td>
                      <td className="px-4 py-3">
                        <PctBadge val={c.approvedPct} t={thresholds} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                            c.missedPct === 0
                              ? "bg-success/10 text-success"
                              : c.missedPct < 15
                                ? "bg-warning/10 text-warning"
                                : "bg-danger/10 text-danger",
                          )}
                        >
                          {c.missedPct}%
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-muted-foreground">
                          ₹{c.payout.toLocaleString("en-IN")}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">{thresholdNote}</p>
        </div>
      )}

      {/* ── By Store ── */}
      {tab === "stores" && (
        <div className="space-y-4">
          {storeBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No store data for this period.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      {(
                        [
                          { key: "name", label: "Store" },
                          { key: "assigned", label: "Assigned" },
                          { key: "submitted", label: "Submitted" },
                          { key: "submissionPct", label: "Submit %" },
                          { key: "approvedPct", label: "Approval %" },
                          { key: "missed", label: "Missed" },
                        ] as { key: keyof StoreAnalysisRow; label: string }[]
                      ).map(({ key, label }) => (
                        <th
                          key={key}
                          className="cursor-pointer select-none px-4 py-3 font-semibold hover:text-foreground"
                          onClick={() => toggleStoreSort(key)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            <SortIcon
                              active={storeSortKey === key}
                              dir={storeSortDir}
                            />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStores.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">
                          {s.name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.assigned}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.submitted}
                        </td>
                        <td className="px-4 py-3">
                          <PctBadge val={s.submissionPct} t={thresholds} />
                        </td>
                        <td className="px-4 py-3">
                          <PctBadge val={s.approvedPct} t={thresholds} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.missed}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">{thresholdNote}</p>
            </>
          )}
        </div>
      )}

      {/* ── By Person ── */}
      {tab === "people" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-foreground">
              Job Title
            </label>
            <select
              value={selJobTitle}
              onChange={(e) => handleJobTitleChange(e.target.value)}
              className="rounded-xl border border-transparent bg-input px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select job title…</option>
              {options.jobTitles.map((jt) => (
                <option key={jt.id} value={jt.id}>
                  {jt.name}
                </option>
              ))}
            </select>
            {personPending && (
              <span className="text-xs text-muted-foreground">Loading…</span>
            )}
          </div>

          {!selJobTitle && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Select a job title above to see person-level breakdown.
            </p>
          )}

          {selJobTitle && !personPending && personRows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No active people with this job title, or no tasks in this period.
            </p>
          )}

          {selJobTitle && personRows.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Assigned</th>
                      <th className="px-4 py-3 font-semibold">Done</th>
                      <th className="px-4 py-3 font-semibold">Completion %</th>
                      <th className="px-4 py-3 font-semibold">Approval %</th>
                      <th className="px-4 py-3 font-semibold">Missed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personRows.map((p) => (
                      <tr
                        key={p.userId}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">
                          {p.name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.assigned}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.done}
                        </td>
                        <td className="px-4 py-3">
                          <PctBadge val={p.completionPct} t={thresholds} />
                        </td>
                        <td className="px-4 py-3">
                          <PctBadge val={p.approvedPct} t={thresholds} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.missed}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Task attribution: all tasks at stores linked to each person via
                their store assignments — same logic as Leaderboard.
              </p>
              <p className="text-xs text-muted-foreground">{thresholdNote}</p>
            </>
          )}
        </div>
      )}

      {/* ── AI Quality ── */}
      {tab === "ai" && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">
                AI vs Human Agreement
              </h2>
              {aiData.totalSubmissions === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No submissions in this period.
                </p>
              ) : (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total submissions</dt>
                    <dd className="font-medium">{aiData.totalSubmissions}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Human reviewed</dt>
                    <dd className="font-medium">{aiData.reviewed}</dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <dt className="text-muted-foreground">AI + Human agree</dt>
                    <dd className="font-medium text-success">
                      {aiData.agreed} (
                      {aiData.reviewed > 0
                        ? Math.round((aiData.agreed / aiData.reviewed) * 100)
                        : 0}
                      %)
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Human overrode AI</dt>
                    <dd className="font-medium text-warning">
                      {aiData.reviewed - aiData.agreed} ({aiData.overrideRate}%)
                    </dd>
                  </div>
                  <div className="space-y-1.5 border-t border-border pt-2">
                    <div className="flex justify-between">
                      <dt className="text-xs text-muted-foreground">
                        AI approved → Human rejected
                      </dt>
                      <dd className="text-xs font-medium text-danger">
                        {aiData.aiApprovedHumanRejected}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-xs text-muted-foreground">
                        AI rejected → Human approved
                      </dt>
                      <dd className="text-xs font-medium text-success">
                        {aiData.aiRejectedHumanApproved}
                      </dd>
                    </div>
                  </div>
                  {aiData.missingAi > 0 && (
                    <div className="flex justify-between border-t border-border pt-2">
                      <dt className="text-muted-foreground">
                        Missing AI score
                      </dt>
                      <dd className="font-medium text-warning">
                        {aiData.missingAi}
                      </dd>
                    </div>
                  )}
                  <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                    High "AI approved → Human rejected" = rubric too lenient.
                    Tighten the scoring rubric or raise the pass threshold.
                  </p>
                </dl>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">
                Top Rejection Reasons
              </h2>
              {aiData.rejectionReasons.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No rejections in this period.
                </p>
              ) : (
                <ul className="space-y-3">
                  {aiData.rejectionReasons.map((r) => (
                    <li key={r.name}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="mr-2 truncate text-foreground">
                          {r.name}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {r.count}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-danger/60"
                          style={{
                            width: `${(r.count / aiData.rejectionReasons[0].count) * 100}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {aiData.byCampaign.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
                AI Performance by Campaign
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Campaign</th>
                    <th className="px-4 py-3 font-semibold">Submissions</th>
                    <th className="px-4 py-3 font-semibold">AI Pass Rate</th>
                    <th className="px-4 py-3 font-semibold">Override Rate</th>
                    <th className="px-4 py-3 font-semibold">Missing AI</th>
                  </tr>
                </thead>
                <tbody>
                  {aiData.byCampaign.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        {c.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.reviewed}
                      </td>
                      <td className="px-4 py-3">
                        <PctBadge val={c.aiPassRate} t={thresholds} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                            c.overrideRate < 10
                              ? "bg-success/10 text-success"
                              : c.overrideRate < 20
                                ? "bg-warning/10 text-warning"
                                : "bg-danger/10 text-danger",
                          )}
                        >
                          {c.overrideRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.missing > 0 ? (
                          <span className="text-warning">{c.missing}</span>
                        ) : (
                          0
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
