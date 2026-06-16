"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Search, ZoomIn, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/core/lib/utils";
import { Input } from "@/core/ui/input";
import { Button } from "@/core/ui/button";
import { MultiSelect } from "@/core/ui/multi-select";
import type { StoreRank, JobTitleRank } from "../queries";
import { getUserTaskDetails, type TaskDetail } from "../actions";

const MEDALS = ["🥇", "🥈", "🥉"];
function medal(i: number) {
  return MEDALS[i] ?? `${i + 1}`;
}

function ProgressBar({ value, cls }: { value: number; cls?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", cls ?? "bg-success")}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
  );
}

function pctCls(v: number) {
  return v >= 80 ? "bg-success" : v >= 50 ? "bg-warning" : "bg-danger";
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(d: string) {
  const [, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]}`;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  approved:  { label: "Approved",   cls: "bg-success/10 text-success" },
  rejected:  { label: "Rejected",   cls: "bg-danger/10 text-danger" },
  submitted: { label: "Submitted",  cls: "bg-info/10 text-info" },
  pending:   { label: "Not done",   cls: "bg-muted text-muted-foreground" },
  missed:    { label: "Missed",     cls: "bg-muted text-muted-foreground" },
  not_done:  { label: "Not done",   cls: "bg-muted text-muted-foreground" },
};

const DONE_STATUSES = new Set(["submitted", "approved", "rejected"]);

function StatChip({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", active ? "bg-primary/20" : "bg-muted")}>
        {value}
      </span>
    </button>
  );
}

export function LeaderboardClient({
  jobTitles,
  campaigns,
  selectedJobTitleId,
  dateFrom,
  dateTo,
  selectedCampaignIds,
  jtRows,
  storeRows,
  isAdmin,
}: {
  jobTitles: { id: string; name: string }[];
  campaigns: { id: string; name: string; status: string }[];
  selectedJobTitleId: string | null;
  dateFrom: string;
  dateTo: string;
  selectedCampaignIds: string[];
  jtRows: JobTitleRank[] | null;
  storeRows: StoreRank[];
  isAdmin: boolean;
}) {
  const router = useRouter();

  const [localFrom, setLocalFrom] = useState(dateFrom);
  const [localTo, setLocalTo] = useState(dateTo);
  const [localCampaigns, setLocalCampaigns] = useState<string[]>(selectedCampaignIds);
  const [search, setSearch] = useState("");

  // Person detail state
  const [selectedJtRow, setSelectedJtRow] = useState<JobTitleRank | null>(null);
  const [taskDetails, setTaskDetails] = useState<TaskDetail[] | null>(null);
  const [detailPending, startDetail] = useTransition();
  const [detailStatusFilter, setDetailStatusFilter] = useState<string>("all");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

  // Store detail
  const [selectedStoreRow, setSelectedStoreRow] = useState<StoreRank | null>(null);

  function buildUrl(opts: { jobTitle?: string | null; from?: string; to?: string; campaigns?: string[] }) {
    const jt = opts.jobTitle !== undefined ? opts.jobTitle : selectedJobTitleId;
    const from = opts.from ?? localFrom;
    const to = opts.to ?? localTo;
    const cids = opts.campaigns ?? localCampaigns;
    const p = new URLSearchParams();
    if (jt) p.set("job_title", jt);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (cids.length) p.set("campaigns", cids.join(","));
    return `/leaderboard?${p.toString()}`;
  }

  function apply() { router.push(buildUrl({})); }

  function selectJobTitle(id: string) {
    router.push(buildUrl({ jobTitle: id === selectedJobTitleId ? null : id }));
  }

  function openPersonDetail(row: JobTitleRank) {
    setSelectedJtRow(row);
    setTaskDetails(null);
    setDetailStatusFilter("all");
    setExpandedTaskId(null);
    startDetail(async () => {
      const details = await getUserTaskDetails({
        userId: row.userId,
        campaignIds: selectedCampaignIds,
        dateFrom,
        dateTo,
      });
      setTaskDetails(details);
    });
  }

  function closeDetail() {
    setSelectedJtRow(null);
    setTaskDetails(null);
    setExpandedTaskId(null);
  }

  const selectedJobTitle = jobTitles.find((j) => j.id === selectedJobTitleId);
  const campaignOpts = campaigns.map((c) => ({ id: c.id, label: c.name }));

  const filteredJtRows = (jtRows ?? []).filter(
    (r) => !search || r.name.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredStoreRows = storeRows.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Detail modal computed values
  const pendingCount  = (taskDetails ?? []).filter((t) => t.status === "pending").length;
  const doneCount     = (taskDetails ?? []).filter((t) => DONE_STATUSES.has(t.status)).length;
  const missedCount   = (taskDetails ?? []).filter((t) => t.status === "missed").length;
  const notDoneCount  = (taskDetails ?? []).filter((t) => t.status === "not_done").length;
  const approvedCount = (taskDetails ?? []).filter((t) => t.status === "approved").length;

  const DETAIL_FILTERS = [
    { key: "all",      label: "All",      count: (taskDetails ?? []).length },
    { key: "not_done", label: "Not done", count: pendingCount + notDoneCount },
    { key: "done",     label: "Done",     count: doneCount },
    { key: "missed",   label: "Missed",   count: missedCount },
  ];

  const visibleTasks = (taskDetails ?? []).filter((t) => {
    if (detailStatusFilter === "all") return true;
    if (detailStatusFilter === "done") return DONE_STATUSES.has(t.status);
    if (detailStatusFilter === "not_done") return t.status === "pending" || t.status === "not_done";
    return t.status === detailStatusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ranked by task completion — irrespective of who submitted.
        </p>
      </div>

      {/* Job title selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-foreground">Job title</label>
        <select
          value={selectedJobTitleId ?? ""}
          onChange={(e) => selectJobTitle(e.target.value)}
          className="rounded-xl border border-transparent bg-input px-4 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Select a job title…</option>
          {jobTitles.map((jt) => (
            <option key={jt.id} value={jt.id}>{jt.name}</option>
          ))}
        </select>
        {selectedJobTitleId && (
          <button
            type="button"
            onClick={() => selectJobTitle(selectedJobTitleId)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">From</label>
          <Input type="date" value={localFrom} onChange={(e) => setLocalFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">To</label>
          <Input type="date" value={localTo} onChange={(e) => setLocalTo(e.target.value)} />
        </div>
        <div className="min-w-56 space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">
            Campaigns{localCampaigns.length > 0 ? ` (${localCampaigns.length})` : " — all"}
          </label>
          <MultiSelect
            options={campaignOpts}
            selected={localCampaigns}
            onChange={setLocalCampaigns}
            placeholder="All campaigns"
          />
        </div>
        <Button size="md" onClick={apply}>Apply</Button>
        {(localFrom !== dateFrom || localTo !== dateTo || localCampaigns.join(",") !== selectedCampaignIds.join(",")) && (
          <button
            type="button"
            onClick={() => { setLocalFrom(dateFrom); setLocalTo(dateTo); setLocalCampaigns(selectedCampaignIds); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-xl border border-transparent bg-input py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Job title ranking */}
      {selectedJobTitleId ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            {selectedJobTitle?.name ?? "People"} ranking
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {fmtDate(dateFrom)} → {fmtDate(dateTo)}
            </span>
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-12 px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Assigned</th>
                  <th className="px-4 py-3 font-semibold">Done</th>
                  <th className="min-w-40 px-4 py-3 font-semibold">Completion</th>
                  <th className="px-4 py-3 font-semibold">Approved</th>
                  <th className="min-w-40 px-4 py-3 font-semibold">Approval of done</th>
                </tr>
              </thead>
              <tbody>
                {filteredJtRows.map((r, i) => (
                  <tr
                    key={r.userId}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                    onClick={() => openPersonDetail(r)}
                  >
                    <td className="px-4 py-3 text-center text-base">{medal(i)}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.assigned}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.done}</td>
                    <td className="px-4 py-3"><ProgressBar value={r.completionPct} cls={pctCls(r.completionPct)} /></td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.approved}</td>
                    <td className="px-4 py-3"><ProgressBar value={r.approvalPct} cls={pctCls(r.approvalPct)} /></td>
                  </tr>
                ))}
                {filteredJtRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                      {jtRows?.length === 0
                        ? `No ${selectedJobTitle?.name ?? "people"} with tasks in this period.`
                        : "No results match your search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Select a job title above to see rankings.
        </div>
      )}

      {/* Store ranking (admin only) */}
      {isAdmin && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Store ranking</h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-12 px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Store</th>
                  <th className="px-4 py-3 font-semibold">Assigned</th>
                  <th className="px-4 py-3 font-semibold">Done</th>
                  <th className="min-w-40 px-4 py-3 font-semibold">Completion</th>
                  <th className="px-4 py-3 font-semibold">Approved</th>
                  <th className="min-w-40 px-4 py-3 font-semibold">Approval of done</th>
                </tr>
              </thead>
              <tbody>
                {filteredStoreRows.map((s, i) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                    onClick={() => setSelectedStoreRow(s)}
                  >
                    <td className="px-4 py-3 text-center text-base">{medal(i)}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{s.assigned}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{s.done}</td>
                    <td className="px-4 py-3"><ProgressBar value={s.completionPct} cls={pctCls(s.completionPct)} /></td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{s.approved}</td>
                    <td className="px-4 py-3"><ProgressBar value={s.approvalPct} cls={pctCls(s.approvalPct)} /></td>
                  </tr>
                ))}
                {filteredStoreRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                      No store data for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Person detail modal ── */}
      {selectedJtRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeDetail} aria-hidden />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-card shadow-xl">

            {/* Modal header */}
            <div className="flex items-start justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{selectedJtRow.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedJobTitle?.name} · {fmtDate(dateFrom)} – {fmtDate(dateTo)}
                </p>
              </div>
              <button type="button" onClick={closeDetail} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-5 gap-3 border-b border-border px-6 py-4">
              {[
                { label: "Assigned", value: selectedJtRow.assigned },
                { label: "Done",     value: selectedJtRow.done },
                { label: "Approved", value: approvedCount },
                { label: "Missed",   value: missedCount },
                { label: "Not done", value: pendingCount + notDoneCount },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{detailPending ? "—" : s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Status filter chips */}
            <div className="flex flex-wrap gap-2 border-b border-border px-6 py-3">
              {DETAIL_FILTERS.map((f) => (
                <StatChip
                  key={f.key}
                  label={f.label}
                  value={detailPending ? 0 : f.count}
                  active={detailStatusFilter === f.key}
                  onClick={() => setDetailStatusFilter(f.key)}
                />
              ))}
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {detailPending && (
                <div className="p-10 text-center text-sm text-muted-foreground">Loading tasks…</div>
              )}

              {!detailPending && visibleTasks.length === 0 && (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No tasks in this category.
                </div>
              )}

              {!detailPending && visibleTasks.map((t) => {
                const meta = STATUS_META[t.status] ?? { label: t.status, cls: "bg-muted text-muted-foreground" };
                const isExpanded = expandedTaskId === t.taskId;
                const hasSubmission = !!t.submission;

                return (
                  <div key={t.taskId}>
                    {/* Task row */}
                    <button
                      type="button"
                      onClick={() => setExpandedTaskId(isExpanded ? null : t.taskId)}
                      className={cn(
                        "flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-muted/40",
                        isExpanded && "bg-muted/30",
                      )}
                    >
                      <span className="text-muted-foreground">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4" />
                          : <ChevronRight className="h-4 w-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{t.campaignName}</p>
                        <p className="text-xs text-muted-foreground">{t.storeName}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(t.dueDate)}</span>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", meta.cls)}>
                        {meta.label}
                      </span>
                      {hasSubmission && t.submission?.aiScore != null && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t.submission.aiScore}/10
                        </span>
                      )}
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-border/50 bg-muted/20 px-6 py-4 space-y-3">

                        {/* Not done reason */}
                        {t.status === "not_done" && t.nonSubmissionReason && (
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Reason: </span>
                            {t.nonSubmissionReason}
                          </p>
                        )}

                        {/* Missed — no action needed */}
                        {t.status === "missed" && (
                          <p className="text-sm text-muted-foreground">Task was not submitted before the deadline.</p>
                        )}

                        {/* Pending — not submitted */}
                        {t.status === "pending" && (
                          <p className="text-sm text-muted-foreground">Not submitted.</p>
                        )}

                        {/* Submission detail */}
                        {t.submission && (
                          <>
                            {/* Verdict row */}
                            <div className="flex flex-wrap items-center gap-3">
                              {t.submission.humanVerdict && (
                                <span className={cn(
                                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                                  t.submission.humanVerdict === "approved" ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                                )}>
                                  Reviewer: {t.submission.humanVerdict}
                                </span>
                              )}
                              {t.submission.payoutTierLabel && (
                                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                                  {t.submission.payoutTierLabel}
                                </span>
                              )}
                              {t.submission.aiScore != null && (
                                <span className="text-sm text-muted-foreground">
                                  AI score: <span className="font-medium text-foreground">{t.submission.aiScore}/10</span>
                                  {t.submission.aiVerdict && (
                                    <span className={cn(
                                      "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]",
                                      t.submission.aiVerdict === "approved" ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                                    )}>
                                      {t.submission.aiVerdict}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>

                            {/* Submitted by */}
                            {t.submission.submittedByName && (
                              <p className="text-sm text-muted-foreground">
                                Submitted by: <span className="font-medium text-foreground">{t.submission.submittedByName}</span>
                              </p>
                            )}

                            {/* Rejection reason */}
                            {t.submission.rejectionReason && (
                              <p className="text-sm text-danger">
                                Rejection reason: {t.submission.rejectionReason}
                              </p>
                            )}

                            {/* Comments */}
                            {t.submission.comments && (
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">Note: </span>
                                {t.submission.comments}
                              </p>
                            )}

                            {/* Photos */}
                            {t.submission.photos.length > 0 && (
                              <div className="grid grid-cols-4 gap-2">
                                {t.submission.photos.map((url) => (
                                  <button
                                    key={url}
                                    type="button"
                                    onClick={() => setExpandedPhoto(url)}
                                    className="group relative aspect-square overflow-hidden rounded-lg border border-border"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt="Proof" className="h-full w-full object-cover" />
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100 rounded-lg">
                                      <ZoomIn className="h-5 w-5 text-white" />
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Store detail modal */}
      {selectedStoreRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedStoreRow(null)} aria-hidden />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{selectedStoreRow.name}</h2>
              <button type="button" onClick={() => setSelectedStoreRow(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Completion</p>
                <ProgressBar value={selectedStoreRow.completionPct} cls={pctCls(selectedStoreRow.completionPct)} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Approval of done</p>
                <ProgressBar value={selectedStoreRow.approvalPct} cls={pctCls(selectedStoreRow.approvalPct)} />
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                {[
                  { label: "Assigned", value: selectedStoreRow.assigned },
                  { label: "Done",     value: selectedStoreRow.done },
                  { label: "Approved", value: selectedStoreRow.approved },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl bg-muted/50 p-3 text-center">
                    <p className="text-xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" size="md" onClick={() => setSelectedStoreRow(null)}>Close</Button>
            </div>
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
