"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/core/lib/utils";
import type { CampaignHealthRow, Health, WeekSel } from "../stats";

type Mode = "weekly" | "monthly";
type Scope = "active" | "all";

const BANDS: { key: Health; label: string }[] = [
  { key: "critical", label: "Critical" },
  { key: "needs_attention", label: "Needs Attention" },
  { key: "on_track", label: "On Track" },
  { key: "no_data", label: "No Data" },
];

const BAND_ACCENT: Record<Health, string> = {
  critical: "hsl(var(--danger))",
  needs_attention: "hsl(var(--warning))",
  on_track: "hsl(var(--success))",
  no_data: "hsl(var(--muted-foreground))",
};

const BAND_LABEL_CLS: Record<Health, string> = {
  critical: "text-danger",
  needs_attention: "text-warning",
  on_track: "text-success",
  no_data: "text-muted-foreground",
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const WEEKS: { value: WeekSel; label: string }[] = [
  { value: "all", label: "All" },
  { value: "w1", label: "W1" },
  { value: "w2", label: "W2" },
  { value: "w3", label: "W3" },
  { value: "w4", label: "W4" },
];

function pctColor(p: number): string {
  if (p >= 80) return "text-success";
  if (p >= 50) return "text-warning";
  return "text-danger";
}

function cantDoColor(p: number): string {
  if (p === 0) return "text-muted-foreground";
  if (p < 20) return "text-warning";
  return "text-danger";
}

function Chip({
  count,
  variant,
}: {
  count: number;
  variant: "pend" | "sub" | "appr" | "rej" | "nd";
}) {
  if (!count) return null;
  const cls: Record<string, string> = {
    pend: "bg-muted text-muted-foreground",
    sub: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    appr: "bg-success/10 text-success",
    rej: "bg-danger/10 text-danger",
    nd: "bg-warning/10 text-warning",
  };
  const label: Record<string, string> = {
    pend: "pend",
    sub: "sub",
    appr: "appr",
    rej: "rej",
    nd: "can't",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        cls[variant],
      )}
    >
      {count} {label[variant]}
    </span>
  );
}

export function HealthTableClient({
  rows,
  selYear,
  selMonth,
  selWeek,
  nowYear,
  nowMonth,
  nowWeekNum,
}: {
  rows: CampaignHealthRow[];
  selYear: number;
  selMonth: number;
  selWeek: WeekSel;
  nowYear: number;
  nowMonth: number;
  nowWeekNum: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local-only view state (filters the already-fetched rows; no server round-trip)
  const [mode, setMode] = useState<Mode>("weekly");
  const [scope, setScope] = useState<Scope>("active");
  const [dept, setDept] = useState("");
  const [openBands, setOpenBands] = useState<Record<Health, boolean>>({
    critical: true,
    needs_attention: true,
    on_track: false,
    no_data: false,
  });

  const toggleBand = (key: Health) =>
    setOpenBands((prev) => ({ ...prev, [key]: !prev[key] }));

  // Month dropdown options — last 6 months including current
  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(nowYear, nowMonth - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      opts.push({
        year: y,
        month: m,
        label: `${MONTH_LABELS[d.getMonth()]} '${String(y).slice(2)}${i === 0 ? " (current)" : ""}`,
        value: `${y}-${String(m).padStart(2, "0")}`,
      });
    }
    return opts;
  }, [nowYear, nowMonth]);

  const selMonthValue = `${selYear}-${String(selMonth).padStart(2, "0")}`;
  const isCurrentMonth = selYear === nowYear && selMonth === nowMonth;

  function isFutureWeek(w: WeekSel): boolean {
    if (w === "all") return false;
    if (!isCurrentMonth) return false;
    return parseInt(w[1]) > nowWeekNum;
  }

  // Push month/week selection into the URL so the server re-fetches the window.
  function navigate(month: string, week: WeekSel) {
    const params = new URLSearchParams();
    params.set("month", month);
    params.set("week", week);
    startTransition(() => {
      router.replace(`/dashboard?${params.toString()}`, { scroll: false });
    });
  }

  function handleMonthChange(value: string) {
    const [y, m] = value.split("-").map(Number);
    const isCur = y === nowYear && m === nowMonth;
    navigate(value, isCur ? (`w${nowWeekNum}` as WeekSel) : "all");
  }

  function handleWeek(w: WeekSel) {
    if (isFutureWeek(w)) return;
    navigate(selMonthValue, w);
  }

  // 1. Filter by frequency tab
  const modeRows = useMemo(
    () => rows.filter((r) => r.frequency === mode),
    [rows, mode],
  );

  // 2. Filter by active / all
  const scopedRows = useMemo(
    () => (scope === "active" ? modeRows.filter((r) => r.status === "active") : modeRows),
    [modeRows, scope],
  );

  // 3. Department pills — derived from scoped rows
  const depts = useMemo(() => {
    const seen = new Set<string>();
    for (const r of scopedRows)
      for (const d of r.departmentNames) seen.add(d);
    return [...seen].sort();
  }, [scopedRows]);

  // Reset dept if it disappears from the current scope
  const activeDept = depts.includes(dept) ? dept : "";

  // 4. Apply department filter
  const visible = useMemo(
    () =>
      activeDept
        ? scopedRows.filter((r) => r.departmentNames.includes(activeDept))
        : scopedRows,
    [scopedRows, activeDept],
  );

  // Period label for footer note
  const periodLabel = useMemo(() => {
    const mStr = `${MONTH_LABELS[selMonth - 1]} '${String(selYear).slice(2)}`;
    if (mode === "monthly") return mStr;
    if (selWeek === "all") return mStr;
    const isCurrent =
      isCurrentMonth && selWeek === (`w${nowWeekNum}` as WeekSel);
    return isCurrent ? "the current week" : `${selWeek.toUpperCase()} of ${mStr}`;
  }, [selYear, selMonth, selWeek, mode, isCurrentMonth, nowWeekNum]);

  // Helpers keyed to current mode
  const getHealth = (r: CampaignHealthRow): Health =>
    mode === "weekly" ? r.healthWeek : r.healthMonth;

  const getSubPct = (r: CampaignHealthRow) =>
    mode === "weekly" ? r.submissionPctWeek : r.submissionPctMonth;

  const getTotal = (r: CampaignHealthRow) =>
    mode === "weekly" ? r.weekTotal : r.monthTotal;

  const getCounts = (r: CampaignHealthRow) =>
    mode === "weekly"
      ? {
          pend: r.weekPending,
          sub: r.weekSubmittedOnly,
          appr: r.weekApproved,
          rej: r.weekRejected,
          nd: r.weekNotDone,
        }
      : {
          pend: r.monthPending,
          sub: r.monthSubmittedOnly,
          appr: r.monthApproved,
          rej: r.monthRejected,
          nd: r.monthNotDone,
        };

  // Group into bands
  const grouped = useMemo(() => {
    const g: Record<Health, CampaignHealthRow[]> = {
      critical: [],
      needs_attention: [],
      on_track: [],
      no_data: [],
    };
    for (const r of visible) g[getHealth(r)].push(r);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode]);

  return (
    <section className="mt-8">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Campaign health</h2>

        <div className="flex flex-wrap items-center gap-2">
          {/* Month dropdown */}
          <select
            value={selMonthValue}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="rounded-xl border border-transparent bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Scope dropdown */}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            className="rounded-xl border border-transparent bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
          >
            <option value="active">Active campaigns</option>
            <option value="all">All campaigns</option>
          </select>

          {/* Frequency toggle */}
          <div className="flex rounded-xl border border-border bg-input p-0.5">
            {(["weekly", "monthly"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setDept("");
                }}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                  mode === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Week pills — only on Weekly tab */}
      {mode === "weekly" && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Week
          </span>
          {WEEKS.map(({ value: w, label }) => {
            const future = isFutureWeek(w);
            const isSelected = selWeek === w;
            const isCurWeek =
              w !== "all" && isCurrentMonth && parseInt(w[1]) === nowWeekNum;
            return (
              <button
                key={w}
                type="button"
                disabled={future}
                onClick={() => handleWeek(w)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  isSelected && !future
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                  future &&
                    "cursor-not-allowed opacity-35 hover:border-border hover:text-muted-foreground",
                )}
              >
                {label}
                {isCurWeek && !isSelected && (
                  <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
                )}
                {isCurWeek && isSelected && (
                  <span className="ml-1 text-[10px] opacity-70">now</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Department pills */}
      {depts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dept
          </span>
          {(["", ...depts] as string[]).map((d) => (
            <button
              key={d || "__all__"}
              type="button"
              onClick={() => setDept(d)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activeDept === d
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground hover:text-foreground",
              )}
            >
              {d || "All"}
            </button>
          ))}
        </div>
      )}

      {/* Banded sections */}
      <div
        className={cn(
          "flex flex-col gap-2 transition-opacity duration-200",
          isPending && "pointer-events-none opacity-50",
        )}
      >
        {BANDS.map((band) => {
          const list = grouped[band.key];
          const isOpen = openBands[band.key];

          return (
            <div
              key={band.key}
              className="overflow-hidden rounded-2xl border border-border bg-card"
              style={{ borderLeftWidth: 3, borderLeftColor: BAND_ACCENT[band.key] }}
            >
              <button
                type="button"
                onClick={() => toggleBand(band.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/40",
                  isOpen && "border-b border-border",
                )}
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: BAND_ACCENT[band.key] }}
                />
                <span
                  className={cn(
                    "text-xs font-bold uppercase tracking-widest",
                    BAND_LABEL_CLS[band.key],
                  )}
                >
                  {band.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  &nbsp;·&nbsp;{list.length} campaign{list.length !== 1 ? "s" : ""}
                </span>
                <ChevronDown
                  className={cn(
                    "ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              {isOpen && (
                <div>
                  {list.length === 0 ? (
                    <p className="px-4 py-5 text-center text-sm text-muted-foreground">
                      None in this band.
                    </p>
                  ) : (
                    list.map((r) => {
                      const total = getTotal(r);
                      const sp = getSubPct(r);
                      const c = getCounts(r);
                      const hasData = total > 0;
                      const cantDoPct = hasData ? Math.round((c.nd / total) * 100) : 0;
                      const hasAnychip = c.pend + c.sub + c.appr + c.rej + c.nd > 0;

                      return (
                        <div
                          key={r.id}
                          className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-muted/30"
                        >
                          {/* Campaign name */}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {r.name}
                          </span>

                          {/* Execution type tag */}
                          {r.executionTypeName && (
                            <span className="flex-shrink-0 whitespace-nowrap rounded bg-input px-1.5 py-0.5 text-xs text-muted-foreground">
                              {r.executionTypeName}
                            </span>
                          )}

                          {/* Status chips */}
                          {hasAnychip && (
                            <div className="flex flex-shrink-0 items-center gap-1">
                              <Chip count={c.pend} variant="pend" />
                              <Chip count={c.sub} variant="sub" />
                              <Chip count={c.appr} variant="appr" />
                              <Chip count={c.rej} variant="rej" />
                              <Chip count={c.nd} variant="nd" />
                            </div>
                          )}

                          {/* Stats: sub rate | can't do | non-rej */}
                          <div className="flex flex-shrink-0 items-stretch gap-0 border-l border-border pl-3">
                            {/* Sub rate */}
                            <div className="flex flex-col items-end border-r border-border pr-3">
                              <span
                                className={cn(
                                  "text-xs font-bold tabular-nums",
                                  !hasData ? "text-muted-foreground" : pctColor(sp),
                                )}
                              >
                                {hasData ? `${sp}%` : "—"}
                              </span>
                              <span className="text-xs text-muted-foreground">sub rate</span>
                            </div>

                            {/* Can't do */}
                            <div className="flex flex-col items-end border-r border-border px-3">
                              <span
                                className={cn(
                                  "text-xs font-bold tabular-nums",
                                  !hasData ? "text-muted-foreground" : cantDoColor(cantDoPct),
                                )}
                              >
                                {hasData ? `${cantDoPct}%` : "—"}
                              </span>
                              <span className="text-xs text-muted-foreground">can't do</span>
                            </div>

                            {/* Non-rejection (all-time) */}
                            <div className="flex flex-col items-end pl-3">
                              <span
                                className={cn(
                                  "text-xs font-bold tabular-nums",
                                  r.reviewedCount === 0
                                    ? "text-muted-foreground"
                                    : pctColor(r.nonRejectionPct),
                                )}
                              >
                                {r.reviewedCount === 0 ? "—" : `${r.nonRejectionPct}%`}
                              </span>
                              <span className="text-xs text-muted-foreground">non-rej</span>
                            </div>
                          </div>

                          {/* Summary link */}
                          <Link
                            href={`/summary?campaign=${r.id}`}
                            className="flex-shrink-0 rounded border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
                          >
                            Summary →
                          </Link>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {visible.length === 0 && !isPending && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          No {mode} campaigns found.{scope === "active" ? ' Switch to "All campaigns" to see past campaigns.' : ""}
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Sub rate and can&apos;t do % are based on tasks due in {periodLabel}. Non-rej % is all-time.
      </p>
    </section>
  );
}
