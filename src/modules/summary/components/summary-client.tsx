"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, X, ZoomIn, MapPin, Copy, Search, Flag } from "lucide-react";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import type { Matrix, CellData } from "../queries";
import type { PayoutTier } from "@/modules/campaigns/types";
import { approveSubmission, rejectSubmission, selectPayoutTier } from "@/modules/review/actions";
import { acknowledgeNonSubmission, resetTaskToPending } from "@/modules/tasks/actions";
import { closeGeofenceFlag, closeDuplicateFlag } from "../actions";

const CELL: Record<string, { cls: string; label: string }> = {
  approved: { cls: "bg-success/15 text-success", label: "Appr" },
  rejected: { cls: "bg-danger/15 text-danger", label: "Rej" },
  submitted: { cls: "bg-info/15 text-info", label: "Sub" },
  pending: { cls: "bg-warning/15 text-warning", label: "Pend" },
  missed: { cls: "bg-muted text-muted-foreground", label: "Miss" },
  not_done: { cls: "bg-muted text-muted-foreground", label: "Can't" },
};

const STATUS_OPTS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "missed", label: "Missed" },
  { value: "not_done", label: "Can't do it" },
];

function tierColor(tiers: PayoutTier[], label: string): string {
  const tier = tiers.find((t) => t.label === label);
  if (!tier) return "bg-muted text-muted-foreground";
  if (tier.pct === 100) return "bg-success/15 text-success";
  if (tier.pct === 0)   return "bg-danger/15 text-danger";
  return "bg-warning/15 text-warning";
}

function cellDisplay(
  c: CellData,
  payoutModel: string,
  payoutTiers: PayoutTier[],
): { label: string; cls: string; aiOnly?: boolean; acknowledged?: boolean } {
  // Human reviewed — show final verdict / tier
  if (c.humanVerdict) {
    if (payoutModel === "tiered" && c.payoutTierLabel) {
      return { label: c.payoutTierLabel, cls: tierColor(payoutTiers, c.payoutTierLabel) };
    }
    return CELL[c.status] ?? { label: c.status, cls: "bg-muted text-muted-foreground" };
  }
  // AI scored but no human verdict yet — show AI verdict with indicator
  if (c.aiVerdict) {
    const matchedTier = payoutTiers.find((t) => t.label === c.aiVerdict);
    if (matchedTier) {
      return { label: c.aiVerdict, cls: tierColor(payoutTiers, c.aiVerdict), aiOnly: true };
    }
    const isApproved = c.aiVerdict === "approved";
    return {
      label: isApproved ? "Appr" : "Rej",
      cls: isApproved ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
      aiOnly: true,
    };
  }
  // Not done — pass acknowledgement state for the grid indicator
  if (c.status === "not_done") {
    return { ...CELL.not_done, acknowledged: c.nonSubmissionAcknowledged };
  }
  return CELL[c.status] ?? { label: c.status, cls: "bg-muted text-muted-foreground" };
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function cycleLabel(d: string): string {
  const [, m, day] = d.split("-").map(Number);
  const w = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
  return `W${w} ${MONTHS[m - 1]}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} '${String(y).slice(2)}`;
}

const WEEK_OPTS = [
  { value: "W1", label: "W1  (1 – 7)" },
  { value: "W2", label: "W2  (8 – 14)" },
  { value: "W3", label: "W3  (15 – 21)" },
  { value: "W4", label: "W4  (22 – end)" },
];

function weekOf(day: number): string {
  return day <= 7 ? "W1" : day <= 14 ? "W2" : day <= 21 ? "W3" : "W4";
}

function VerdictBadge({ data }: { data: CellData }) {
  const verdict = data.humanVerdict ?? data.aiVerdict;
  if (!verdict) return null;
  const isAi = !data.humanVerdict && !!data.aiVerdict;
  return (
    <span
      className={cn(
        "ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        verdict === "approved" ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
      )}
    >
      {isAi ? "AI" : "HR"}: {verdict === "approved" ? "✓" : "✗"}
    </span>
  );
}

export function SummaryClient({
  campaigns,
  selectedId,
  matrix,
  rejectionReasons,
  isAdmin,
}: {
  campaigns: { id: string; name: string; status: string }[];
  selectedId: string | null;
  matrix: Matrix | null;
  rejectionReasons: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cell, setCell] = useState<{ data: CellData; store: string; cycle: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PayoutTier | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

  // Campaign status filter
  const [campaignStatusFilter, setCampaignStatusFilter] = useState("");
  const campaignStatuses = [...new Set(campaigns.map((c) => c.status))].sort();
  const visibleCampaigns = campaignStatusFilter
    ? campaigns.filter((c) => c.status === campaignStatusFilter)
    : campaigns;

  // Filters
  const [storeSearch, setStoreSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [weekFilter, setWeekFilter] = useState("");
  const [viewMode, setViewMode] = useState<"detail" | "summary">("detail");

  // Year options from data
  const yearOptions = matrix
    ? [...new Set(matrix.cycles.map((cy) => cy.slice(0, 4)))].sort()
    : [];

  // Month options — scoped to selected year
  const monthOptions = matrix
    ? [...new Set(
        matrix.cycles
          .filter((cy) => !yearFilter || cy.startsWith(yearFilter))
          .map((cy) => cy.slice(0, 7)),
      )].sort()
    : [];

  function handleYearChange(y: string) {
    setYearFilter(y);
    if (monthFilter && !monthFilter.startsWith(y)) setMonthFilter("");
    setWeekFilter("");
  }

  const visibleCycles: string[] = matrix
    ? matrix.cycles.filter((cy) => {
        const [, , dayStr] = cy.split("-");
        if (yearFilter && !cy.startsWith(yearFilter)) return false;
        if (monthFilter && !cy.startsWith(monthFilter)) return false;
        if (weekFilter && weekOf(parseInt(dayStr)) !== weekFilter) return false;
        return true;
      })
    : [];

  const monthKeys = [...new Set(visibleCycles.map((cy) => cy.slice(0, 7)))].sort();

  function exportCsv() {
    if (!matrix) return;
    const cols = viewMode === "summary" ? monthKeys : visibleCycles;
    const colLabel = viewMode === "summary" ? monthLabel : cycleLabel;
    const header = ["Store", ...cols.map(colLabel)].join(",");
    const lines = matrix.stores.map((s) => {
      const row = matrix.cells[s.id] ?? {};
      const cells = cols.map((col) => {
        if (viewMode === "summary") {
          const mCycles = visibleCycles.filter((cy) => cy.startsWith(col));
          const tot = mCycles.length;
          const appr = mCycles.filter((cy) => row[cy]?.status === "approved").length;
          return tot ? `${Math.round((appr / tot) * 100)}%` : "";
        }
        const c = row[col];
        return c ? (CELL[c.status]?.label ?? c.status) : "";
      });
      return [`"${s.name}"`, ...cells].join(",");
    });
    const csv = [header, ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${matrix.campaignName.replace(/[^a-z0-9]+/gi, "-")}-summary.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openCell(storeName: string, cycle: string, data: CellData | undefined) {
    if (!data) return;
    setCell({ data, store: storeName, cycle });
    setRejecting(false);
    setSelectedTier(null);
    setReason("");
    setError(null);
  }

  function approve() {
    if (!cell?.data.submissionId) return;
    start(async () => {
      const res = await approveSubmission(cell.data.submissionId!);
      if (res?.error) setError(res.error);
      else { setCell(null); router.refresh(); }
    });
  }

  function reject() {
    if (!cell?.data.submissionId) return;
    if (!reason) { setError("Pick a reason."); return; }
    start(async () => {
      const res = await rejectSubmission(cell.data.submissionId!, reason);
      if (res?.error) setError(res.error);
      else { setCell(null); router.refresh(); }
    });
  }

  function chooseTier(t: PayoutTier) {
    if (!cell?.data.submissionId) return;
    if (t.pct > 0) {
      start(async () => {
        const res = await selectPayoutTier(cell.data.submissionId!, t.label, t.pct);
        if (res?.error) setError(res.error);
        else { setCell(null); router.refresh(); }
      });
    } else {
      setSelectedTier(t);
      setReason("");
      setError(null);
    }
  }

  function confirmTier() {
    if (!cell?.data.submissionId || !selectedTier) return;
    if (!reason) { setError("Pick a reason."); return; }
    start(async () => {
      const res = await selectPayoutTier(cell.data.submissionId!, selectedTier.label, selectedTier.pct, reason);
      if (res?.error) setError(res.error);
      else { setCell(null); router.refresh(); }
    });
  }

  function acknowledge() {
    if (!cell?.data.taskId) return;
    start(async () => {
      const res = await acknowledgeNonSubmission(cell.data.taskId);
      if (res?.error) setError(res.error);
      else { setCell(null); router.refresh(); }
    });
  }

  function sendBack() {
    if (!cell?.data.taskId) return;
    start(async () => {
      const res = await resetTaskToPending(cell.data.taskId);
      if (res?.error) setError(res.error);
      else { setCell(null); router.refresh(); }
    });
  }

  function clearGeoFlag() {
    if (!cell?.data.submissionId) return;
    start(async () => {
      const res = await closeGeofenceFlag(cell.data.submissionId!);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  function clearDupFlag() {
    if (!cell?.data.submissionId) return;
    start(async () => {
      const res = await closeDuplicateFlag(cell.data.submissionId!);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  // Derived filtered stores + flag counts
  const filteredStores = matrix
    ? matrix.stores.filter((s) => {
        if (storeSearch && !s.name.toLowerCase().includes(storeSearch.toLowerCase())) return false;
        if (statusFilter) {
          const hasStatus = visibleCycles.some((cy) => matrix.cells[s.id]?.[cy]?.status === statusFilter);
          if (!hasStatus) return false;
        }
        return true;
      })
    : [];

  const flaggedCells = matrix
    ? matrix.stores.flatMap((s) =>
        matrix.cycles.flatMap((cy) => {
          const c = matrix.cells[s.id]?.[cy];
          if (!c?.submissionId) return [];
          if (!c.geofenceFlag && !c.duplicateFlag) return [];
          return [{ store: s.name, cycle: cy, data: c }];
        }),
      )
    : [];

  const currentVerdict = cell ? (cell.data.humanVerdict ?? cell.data.aiVerdict) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Summary</h1>
          <p className="mt-1 text-sm text-muted-foreground">Week-on-week verdicts per store.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={campaignStatusFilter}
            onChange={(e) => {
              setCampaignStatusFilter(e.target.value);
              // If the currently selected campaign is no longer visible, clear it
              if (selectedId) {
                const still = campaigns.find((c) => c.id === selectedId);
                if (still && e.target.value && still.status !== e.target.value) {
                  router.push("/summary");
                }
              }
            }}
            className="rounded-xl border border-transparent bg-input px-4 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All statuses</option>
            {campaignStatuses.map((s) => (
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </select>
          <select
            value={selectedId ?? ""}
            onChange={(e) =>
              router.push(e.target.value ? `/summary?campaign=${e.target.value}` : "/summary")
            }
            className="rounded-xl border border-transparent bg-input px-4 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Select a campaign…</option>
            {visibleCampaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {matrix && (
            <Button variant="outline" size="md" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Period filters + view mode toggle */}
      {matrix && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Year */}
            <div className="flex flex-col gap-0.5">
              <span className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Year</span>
              <select
                value={yearFilter}
                onChange={(e) => handleYearChange(e.target.value)}
                className="rounded-xl border border-transparent bg-input px-4 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {/* Month */}
            <div className="flex flex-col gap-0.5">
              <span className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Month</span>
              <select
                value={monthFilter}
                onChange={(e) => { setMonthFilter(e.target.value); setWeekFilter(""); }}
                className="rounded-xl border border-transparent bg-input px-4 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All</option>
                {monthOptions.map((ym) => (
                  <option key={ym} value={ym}>{monthLabel(ym)}</option>
                ))}
              </select>
            </div>
            {/* Week */}
            <div className="flex flex-col gap-0.5">
              <span className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Week</span>
              <select
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
                className="rounded-xl border border-transparent bg-input px-4 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All</option>
                {WEEK_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {(yearFilter || monthFilter || weekFilter) && (
              <button
                type="button"
                onClick={() => { setYearFilter(""); setMonthFilter(""); setWeekFilter(""); }}
                className="self-end rounded-xl border border-border px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-0.5 self-end rounded-xl border border-border bg-card p-1">
            {([ ["detail","Detail"], ["summary","Summary"] ] as ["detail"|"summary", string][]).map(([mode, lbl]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === mode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Row filters */}
      {matrix && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
              placeholder="Filter stores…"
              className="w-full rounded-xl border border-transparent bg-input py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-transparent bg-input px-3 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
          >
            {STATUS_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {(storeSearch || statusFilter) && (
            <button
              type="button"
              onClick={() => { setStoreSearch(""); setStatusFilter(""); }}
              className="rounded-xl border border-border px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {!matrix && (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Pick a campaign to see its week-on-week verdict matrix.
        </div>
      )}

      {matrix && (
        <>
          {visibleCycles.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              No tasks in this period.
            </div>
          ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-4 py-3 font-semibold">Store</th>
                  {viewMode === "detail"
                    ? visibleCycles.map((cy) => (
                        <th key={cy} className="px-3 py-3 text-center font-semibold">{cycleLabel(cy)}</th>
                      ))
                    : monthKeys.map((mk) => (
                        <th key={mk} className="px-3 py-3 text-center font-semibold">{monthLabel(mk)}</th>
                      ))
                  }
                  <th className="px-4 py-3 text-center font-semibold">Appr %</th>
                </tr>
              </thead>
              <tbody>
                {filteredStores.map((s) => {
                  const row = matrix.cells[s.id] ?? {};
                  const total = visibleCycles.length;
                  const approved = visibleCycles.filter((cy) => row[cy]?.status === "approved").length;
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="sticky left-0 z-10 bg-card px-4 py-2.5 font-medium text-foreground">
                        {s.name}
                      </td>
                      {viewMode === "detail"
                        ? visibleCycles.map((cy) => {
                            const c = row[cy];
                            const display = c ? cellDisplay(c, matrix.payoutModel, matrix.payoutTiers) : null;
                            const hasFlag = c?.geofenceFlag || c?.duplicateFlag;
                            return (
                              <td key={cy} className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => openCell(s.name, cy, c)}
                                  disabled={!c}
                                  className={cn(
                                    "relative inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-medium",
                                    display ? display.cls : "text-muted-foreground/40",
                                    c && "hover:opacity-80",
                                  )}
                                >
                                  {display ? display.label : "—"}
                                  {hasFlag && (
                                    <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-warning text-[8px] text-white">!</span>
                                  )}
                                  {display?.aiOnly && (
                                    <span className="absolute -left-1 -top-1 flex h-3 min-w-[18px] items-center justify-center rounded-full bg-info px-0.5 text-[7px] font-bold leading-none text-white">AI</span>
                                  )}
                                  {display?.acknowledged && (
                                    <span className="absolute -left-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-success text-[8px] font-bold leading-none text-white">✓</span>
                                  )}
                                </button>
                              </td>
                            );
                          })
                        : monthKeys.map((mk) => {
                            const mCycles = visibleCycles.filter((cy) => cy.startsWith(mk));
                            const tot = mCycles.length;
                            const appr = mCycles.filter((cy) => row[cy]?.status === "approved").length;
                            const pct = tot ? Math.round((appr / tot) * 100) : null;
                            return (
                              <td key={mk} className="px-3 py-2.5 text-center">
                                {pct !== null ? (
                                  <span className={cn(
                                    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                                    pct >= 80 ? "bg-success/15 text-success" : pct >= 50 ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger",
                                  )}>
                                    {pct}%
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                            );
                          })
                      }
                      <td className="px-4 py-2.5 text-center text-muted-foreground">
                        {total ? Math.round((approved / total) * 100) : 0}%
                      </td>
                    </tr>
                  );
                })}
                {filteredStores.length === 0 && (
                  <tr>
                    <td colSpan={(viewMode === "detail" ? visibleCycles.length : monthKeys.length) + 2} className="p-10 text-center text-sm text-muted-foreground">
                      No stores match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          {/* Flags section */}
          {flaggedCells.length > 0 && (
            <section className="mt-8">
              <div className="mb-3 flex items-center gap-2">
                <Flag className="h-4 w-4 text-warning" />
                <h2 className="text-sm font-semibold text-foreground">
                  Flagged Submissions ({flaggedCells.length})
                </h2>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Store</th>
                      <th className="px-4 py-3 font-semibold">Cycle</th>
                      <th className="px-4 py-3 font-semibold">Flags</th>
                      {isAdmin && <th className="px-4 py-3 font-semibold">Actions</th>}
                      <th className="px-4 py-3 font-semibold">&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flaggedCells.map(({ store, cycle, data }) => (
                      <tr key={`${store}-${cycle}`} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-foreground">{store}</td>
                        <td className="px-4 py-3 text-muted-foreground">{cycleLabel(cycle)}</td>
                        <td className="px-4 py-3">
                          {data.geofenceFlag && (
                            <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
                              <MapPin className="h-3 w-3" />
                              {data.geofenceDistanceM != null ? `${Math.round(data.geofenceDistanceM)}m away` : "Geofence"}
                            </span>
                          )}
                          {data.duplicateFlag && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">
                              <Copy className="h-3 w-3" />
                              Duplicate
                            </span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {data.geofenceFlag && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    openCell(store, cycle, data);
                                    start(async () => {
                                      const res = await closeGeofenceFlag(data.submissionId!);
                                      if (res?.error) window.alert(res.error);
                                      else router.refresh();
                                    });
                                  }}
                                  disabled={pending}
                                  className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                                >
                                  Dismiss geo flag
                                </button>
                              )}
                              {data.duplicateFlag && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    start(async () => {
                                      const res = await closeDuplicateFlag(data.submissionId!);
                                      if (res?.error) window.alert(res.error);
                                      else router.refresh();
                                    });
                                  }}
                                  disabled={pending}
                                  className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                                >
                                  Dismiss dup flag
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openCell(store, cycle, data)}
                            className="text-xs text-muted-foreground underline hover:text-foreground"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* Cell detail modal */}
      {cell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCell(null)} aria-hidden />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {cell.store} · {cycleLabel(cell.cycle)}
              </h2>
              <button type="button" onClick={() => setCell(null)} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Status + verdict */}
            <div className="flex flex-wrap items-center gap-2">
              {matrix?.payoutModel === "tiered" && cell.data.payoutTierLabel ? (
                <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", tierColor(matrix?.payoutTiers ?? [], cell.data.payoutTierLabel))}>
                  {cell.data.payoutTierLabel}
                </span>
              ) : (
                <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", CELL[cell.data.status]?.cls ?? "bg-muted text-muted-foreground")}>
                  {cell.data.status.replace("_", " ")}
                </span>
              )}
              {cell.data.aiScore != null && (
                <span className="text-sm text-muted-foreground">AI score: {cell.data.aiScore}/10</span>
              )}
              {currentVerdict && (
                <span className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                  matrix?.payoutModel === "tiered"
                    ? tierColor(matrix.payoutTiers, currentVerdict)
                    : currentVerdict === "approved" ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                )}>
                  {!cell.data.humanVerdict && "AI"} verdict: {currentVerdict}
                  {!cell.data.humanVerdict && <span className="ml-1 opacity-60">(pending human)</span>}
                </span>
              )}
            </div>

            {/* Not-done: reason + admin review actions */}
            {cell.data.status === "not_done" && (
              <div className="mt-3 rounded-xl border border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Reason given</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {cell.data.nonSubmissionReason ?? "No reason provided."}
                </p>
                {cell.data.nonSubmissionAcknowledged ? (
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                    ✓ Acknowledged — reason accepted
                  </span>
                ) : isAdmin ? (
                  <>
                    {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" size="md" onClick={sendBack} disabled={pending}>
                        Invalid — send back
                      </Button>
                      <Button size="md" onClick={acknowledge} disabled={pending}>
                        Valid reason
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Pending admin review.</p>
                )}
              </div>
            )}

            {isAdmin && cell.data.aiScore != null && (
              <div className="mt-3 rounded-xl border border-border p-3 text-sm text-muted-foreground">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground">AI assessment</p>
                <p>
                  <span className="font-semibold text-foreground">{cell.data.aiScore}/10</span>
                  {cell.data.aiVerdict && ` · ${cell.data.aiVerdict}`}
                </p>
                {cell.data.aiAssessment && (
                  <ul className="mt-1 list-inside list-disc whitespace-pre-line">
                    {cell.data.aiAssessment}
                  </ul>
                )}
              </div>
            )}

            {cell.data.submittedByName && (
              <p className="mt-2 text-sm text-muted-foreground">
                Submitted by: <span className="font-medium text-foreground">{cell.data.submittedByName}</span>
              </p>
            )}

            {cell.data.rejectionReason && (
              <p className="mt-2 text-sm text-danger">{cell.data.rejectionReason}</p>
            )}

            {/* Flags */}
            {(cell.data.geofenceFlag || cell.data.duplicateFlag) && (
              <div className="mt-3 space-y-1.5 rounded-xl border border-warning/30 bg-warning/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-warning">Flags</p>
                {cell.data.geofenceFlag && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm text-foreground">
                      <MapPin className="h-3.5 w-3.5 text-warning" />
                      {cell.data.geofenceDistanceM != null
                        ? `${Math.round(cell.data.geofenceDistanceM)}m from store`
                        : "Outside geofence"}
                    </span>
                    {isAdmin && (
                      <button type="button" onClick={clearGeoFlag} disabled={pending} className="rounded-lg border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">
                        Dismiss
                      </button>
                    )}
                  </div>
                )}
                {cell.data.duplicateFlag && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm text-foreground">
                      <Copy className="h-3.5 w-3.5 text-danger" />
                      Duplicate photo detected
                    </span>
                    {isAdmin && (
                      <button type="button" onClick={clearDupFlag} disabled={pending} className="rounded-lg border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">
                        Dismiss
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Photos */}
            {cell.data.photos.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {cell.data.photos.map((u) => (
                  <button key={u} type="button" onClick={() => setExpandedPhoto(u)} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="Proof" className="aspect-square w-full rounded-lg border border-border object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                      <ZoomIn className="h-5 w-5 text-white" />
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Review actions (admin only, submitted status, not a not_done task) */}
            {isAdmin && cell.data.submissionId && cell.data.status === "submitted" && (
              matrix?.payoutModel === "tiered" ? (
                <>
                  {selectedTier && (
                    <div className="mt-4 space-y-1.5">
                      <label className="block text-sm font-medium text-foreground">Rejection reason</label>
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full rounded-xl border border-transparent bg-input px-4 py-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">Select a reason…</option>
                        {rejectionReasons.map((r) => (
                          <option key={r.id} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {selectedTier ? (
                      <>
                        <Button variant="outline" size="md" onClick={() => { setSelectedTier(null); setReason(""); setError(null); }}>
                          Back
                        </Button>
                        <Button size="md" onClick={confirmTier} disabled={pending}>
                          Confirm rejection
                        </Button>
                      </>
                    ) : (
                      (matrix?.payoutTiers ?? []).map((t) => (
                        <Button
                          key={t.label}
                          variant={t.pct > 0 ? "primary" : "outline"}
                          size="md"
                          onClick={() => chooseTier(t)}
                          disabled={pending}
                        >
                          {t.label}
                        </Button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  {rejecting && (
                    <div className="mt-4 space-y-1.5">
                      <label className="block text-sm font-medium text-foreground">Rejection reason</label>
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full rounded-xl border border-transparent bg-input px-4 py-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">Select a reason…</option>
                        {rejectionReasons.map((r) => (
                          <option key={r.id} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
                  <div className="mt-4 flex justify-end gap-2">
                    {!rejecting ? (
                      <>
                        <Button variant="outline" size="md" onClick={() => setRejecting(true)}>Reject</Button>
                        <Button size="md" onClick={approve} disabled={pending}>Approve</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="md" onClick={() => setRejecting(false)}>Back</Button>
                        <Button size="md" onClick={reject} disabled={pending}>Confirm rejection</Button>
                      </>
                    )}
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}

      {/* Photo lightbox */}
      {expandedPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setExpandedPhoto(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={expandedPhoto} alt="Full size" className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
          <button
            type="button"
            onClick={() => setExpandedPhoto(null)}
            className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
