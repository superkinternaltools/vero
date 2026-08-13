"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Eye, EyeOff, LocateOff, MapPinOff, CopyX, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { Button } from "@/core/ui/button";
import { MultiSelect } from "@/core/ui/multi-select";
import { cn } from "@/core/lib/utils";
import type { ReviewRow } from "../queries";
import type { PayoutTier } from "@/modules/campaigns/types";
import {
  approveSubmission,
  rejectSubmission,
  selectPayoutTier,
  bulkApproveSubmissions,
  bulkRejectSubmissions,
} from "../actions";

const FLAG_OPTIONS = [
  { id: "geofence", label: "Geofence issue" },
  { id: "duplicate", label: "Duplicate photo" },
  { id: "no_location", label: "No location" },
];
const AI_VERDICT_NONE = "__none__";

function verdictCls(verdict: string, payoutModel: string, tiers: PayoutTier[]): string {
  if (payoutModel === "tiered") {
    const tier = tiers.find((t) => t.label === verdict);
    if (!tier) return "bg-muted text-muted-foreground";
    if (tier.pct === 100) return "bg-success/10 text-success";
    if (tier.pct === 0)   return "bg-danger/10 text-danger";
    return "bg-warning/10 text-warning";
  }
  return verdict === "approved" ? "bg-success/10 text-success" : "bg-danger/10 text-danger";
}

/** For tiered campaigns, map AI score to the tier whose range covers it. */
function aiSuggestedTier(score: number | null, tiers: PayoutTier[]): PayoutTier | null {
  if (score == null || tiers.length === 0) return null;
  return tiers.find((t) => score >= t.min_score && score <= t.max_score) ?? null;
}

/** The AI verdict text as actually shown in the table/modal — tiered
 * campaigns display the AI-suggested tier label, not the raw ai_verdict
 * field. Hidden-for-this-reviewer campaigns return null so the filter can't
 * be used to infer a verdict the UI otherwise conceals. */
function displayVerdict(r: ReviewRow, isAdmin: boolean): string | null {
  if (!isAdmin && !r.aiScoreVisible) return null;
  if (r.payoutModel === "tiered") return aiSuggestedTier(r.aiScore, r.payoutTiers)?.label ?? null;
  return r.aiVerdict;
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ReviewClient({
  reviews,
  rejectionReasons,
  isAdmin,
}: {
  reviews: ReviewRow[];
  rejectionReasons: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAi, setShowAi] = useState(true);
  const [reason, setReason] = useState("");
  const [reviewerScore, setReviewerScore] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [pendingTier, setPendingTier] = useState<{ label: string; pct: number } | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Filters + sort ──────────────────────────────────────────────────────
  const [sortBy, setSortBy] = useState<"oldest" | "newest" | "ai_desc" | "ai_asc">("oldest");
  const [filterCampaignIds, setFilterCampaignIds] = useState<string[]>([]);
  const [filterDeptIds, setFilterDeptIds] = useState<string[]>([]);
  const [filterStoreIds, setFilterStoreIds] = useState<string[]>([]);
  const [filterAiVerdicts, setFilterAiVerdicts] = useState<string[]>([]);
  const [filterFlags, setFilterFlags] = useState<string[]>([]);

  // ── Bulk selection ───────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);

  const campaignOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reviews) map.set(r.campaignId, r.campaignName);
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [reviews]);

  const departmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reviews) r.departmentIds.forEach((id, i) => map.set(id, r.departmentNames[i]));
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [reviews]);

  const storeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reviews) map.set(r.storeId, r.storeName);
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [reviews]);

  const aiVerdictOptions = useMemo(() => {
    const labels = new Set<string>();
    let hasUnscored = false;
    for (const r of reviews) {
      const v = displayVerdict(r, isAdmin);
      if (v) labels.add(v);
      else if (r.aiScore == null) hasUnscored = true;
    }
    const opts = [...labels].sort().map((label) => ({ id: label, label }));
    if (hasUnscored) opts.push({ id: AI_VERDICT_NONE, label: "Not yet scored" });
    return opts;
  }, [reviews, isAdmin]);

  const isFiltered =
    filterCampaignIds.length > 0 ||
    filterDeptIds.length > 0 ||
    filterStoreIds.length > 0 ||
    filterAiVerdicts.length > 0 ||
    filterFlags.length > 0;

  const visibleReviews = useMemo(() => {
    const list = reviews.filter((r) => {
      if (filterCampaignIds.length && !filterCampaignIds.includes(r.campaignId)) return false;
      if (filterStoreIds.length && !filterStoreIds.includes(r.storeId)) return false;
      if (filterDeptIds.length && !r.departmentIds.some((d) => filterDeptIds.includes(d))) return false;
      if (filterAiVerdicts.length) {
        const v = displayVerdict(r, isAdmin) ?? AI_VERDICT_NONE;
        if (!filterAiVerdicts.includes(v)) return false;
      }
      if (filterFlags.length) {
        const rowFlags = [
          r.geofenceFlag && "geofence",
          r.duplicateFlag && "duplicate",
          r.noLocationFlag && "no_location",
        ].filter(Boolean) as string[];
        if (!filterFlags.some((f) => rowFlags.includes(f))) return false;
      }
      return true;
    });
    return list.slice().sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return b.submittedAt.localeCompare(a.submittedAt);
        case "ai_desc":
          return (b.aiScore ?? -1) - (a.aiScore ?? -1);
        case "ai_asc":
          return (a.aiScore ?? 11) - (b.aiScore ?? 11);
        case "oldest":
        default:
          return a.submittedAt.localeCompare(b.submittedAt);
      }
    });
  }, [reviews, filterCampaignIds, filterDeptIds, filterStoreIds, filterAiVerdicts, filterFlags, isAdmin, sortBy]);

  const activeIndex = visibleReviews.findIndex((r) => r.id === activeId);
  const active = activeIndex >= 0 ? visibleReviews[activeIndex] : null;

  function open(r: ReviewRow) {
    setActiveId(r.id);
    // Admin always gets the toggle; start visible if the campaign allows it or if admin (they can always reveal)
    setShowAi(isAdmin ? true : r.aiScoreVisible);
    setReason("");
    setReviewerScore("");
    setRejecting(false);
    setPendingTier(null);
    setError(null);
  }

  const goPrev = () => activeIndex > 0 && open(visibleReviews[activeIndex - 1]);
  const goNext = () => activeIndex < visibleReviews.length - 1 && open(visibleReviews[activeIndex + 1]);

  /** After a verdict, jump straight to the next item in the queue (or close if done). */
  function advanceAfterVerdict() {
    const nextItem = visibleReviews[activeIndex + 1] ?? null;
    if (nextItem) open(nextItem);
    else setActiveId(null);
    router.refresh();
  }

  function approve() {
    if (!active) return;
    const score = reviewerScore ? Number(reviewerScore) : undefined;
    start(async () => {
      const res = await approveSubmission(active.id, score);
      if (res?.error) setError(res.error);
      else advanceAfterVerdict();
    });
  }

  function reject() {
    if (!active) return;
    if (!reason) {
      setError("Pick a rejection reason.");
      return;
    }
    start(async () => {
      const res = await rejectSubmission(active.id, reason);
      if (res?.error) setError(res.error);
      else advanceAfterVerdict();
    });
  }

  // ── Bulk selection ───────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const allSelected = visibleReviews.length > 0 && visibleReviews.every((r) => selectedIds.has(r.id));
    setSelectedIds(allSelected ? new Set() : new Set(visibleReviews.map((r) => r.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkRejectReason("");
    setBulkError(null);
  }

  // Tiered submissions need a specific tier picked per row — can't be bulk
  // approved/rejected as generic full/zero without losing that granularity,
  // so they're excluded here and left for individual review.
  const selectedRows = visibleReviews.filter((r) => selectedIds.has(r.id));
  const selectedBinaryIds = selectedRows.filter((r) => r.payoutModel !== "tiered").map((r) => r.id);
  const selectedTieredCount = selectedRows.length - selectedBinaryIds.length;

  function applyBulkApprove() {
    if (!selectedBinaryIds.length) return;
    setBulkError(null);
    start(async () => {
      const res = await bulkApproveSubmissions(selectedBinaryIds);
      if (res.failed) setBulkError(`${res.failed} of ${selectedBinaryIds.length} failed to approve.`);
      clearSelection();
      router.refresh();
    });
  }

  function applyBulkReject() {
    if (!selectedBinaryIds.length) return;
    if (!bulkRejectReason) {
      setBulkError("Pick a rejection reason.");
      return;
    }
    setBulkError(null);
    start(async () => {
      const res = await bulkRejectSubmissions(selectedBinaryIds, bulkRejectReason);
      if (res.failed) setBulkError(`${res.failed} of ${selectedBinaryIds.length} failed to reject.`);
      clearSelection();
      router.refresh();
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Review</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {visibleReviews.length}
        {isFiltered ? ` of ${reviews.length}` : ""} submission{reviews.length === 1 ? "" : "s"} awaiting review.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Sort by</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-11 w-full rounded-xl border border-transparent bg-input px-3 text-sm text-foreground focus:border-primary focus:bg-background focus:outline-none"
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
            <option value="ai_desc">AI score: high to low</option>
            <option value="ai_asc">AI score: low to high</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Campaign</label>
          <MultiSelect
            options={campaignOptions}
            selected={filterCampaignIds}
            onChange={setFilterCampaignIds}
            placeholder="All campaigns"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Department</label>
          <MultiSelect
            options={departmentOptions}
            selected={filterDeptIds}
            onChange={setFilterDeptIds}
            placeholder="All departments"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Store</label>
          <MultiSelect
            options={storeOptions}
            selected={filterStoreIds}
            onChange={setFilterStoreIds}
            placeholder="All stores"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">AI Verdict</label>
          <MultiSelect
            options={aiVerdictOptions}
            selected={filterAiVerdicts}
            onChange={setFilterAiVerdicts}
            placeholder="All verdicts"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Flags</label>
          <MultiSelect
            options={FLAG_OPTIONS}
            selected={filterFlags}
            onChange={setFilterFlags}
            placeholder="All flags"
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={visibleReviews.length > 0 && visibleReviews.every((r) => selectedIds.has(r.id))}
                  onChange={toggleSelectAllVisible}
                  className="h-4 w-4 cursor-pointer rounded accent-primary"
                />
              </th>
              <th className="px-4 py-3 font-semibold">Campaign</th>
              <th className="px-4 py-3 font-semibold">Store</th>
              <th className="px-4 py-3 font-semibold">Uploaded by</th>
              <th className="px-4 py-3 font-semibold">Department</th>
              <th className="px-4 py-3 font-semibold">AI Score</th>
              <th className="px-4 py-3 font-semibold">AI Verdict</th>
              <th className="px-4 py-3 font-semibold">Flags</th>
              <th className="px-4 py-3 font-semibold">Submitted</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleReviews.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                    className="h-4 w-4 cursor-pointer rounded accent-primary"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-foreground">{r.campaignName}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.storeName}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.submittedByName ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.departmentNames.join(", ") || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {(isAdmin || r.aiScoreVisible) && r.aiScore != null ? `${r.aiScore}/10` : "—"}
                </td>
                <td className="px-4 py-3">
                  {(isAdmin || r.aiScoreVisible) ? (
                    r.payoutModel === "tiered" ? (
                      (() => {
                        const tier = aiSuggestedTier(r.aiScore, r.payoutTiers);
                        return tier ? (
                          <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", verdictCls(tier.label, r.payoutModel, r.payoutTiers))}>
                            {tier.label}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>;
                      })()
                    ) : r.aiVerdict ? (
                      <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", verdictCls(r.aiVerdict, r.payoutModel, r.payoutTiers))}>
                        {r.aiVerdict}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    {r.geofenceFlag && (
                      <span title={`Photo taken ${r.geofenceDistanceM ?? "?"} m from the store`}>
                        <MapPinOff className="h-4 w-4 text-warning" />
                      </span>
                    )}
                    {r.duplicateFlag && (
                      <span title="Photo matches an earlier submission">
                        <CopyX className="h-4 w-4 text-danger" />
                      </span>
                    )}
                    {r.noLocationFlag && (
                      <span title="No GPS location captured">
                        <LocateOff className="h-4 w-4 text-muted-foreground" />
                      </span>
                    )}
                    {!r.geofenceFlag && !r.duplicateFlag && !r.noLocationFlag && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmt(r.submittedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="md" onClick={() => open(r)}>
                    Review
                  </Button>
                </td>
              </tr>
            ))}
            {visibleReviews.length === 0 && (
              <tr>
                <td colSpan={10} className="p-10 text-center text-sm text-muted-foreground">
                  {isFiltered ? "No submissions match these filters." : "Nothing to review right now. 🎉"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Floating bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-lg md:left-64">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} selected
              {selectedTieredCount > 0 && (
                <span className="ml-1 font-normal text-muted-foreground">
                  ({selectedTieredCount} tiered — review individually)
                </span>
              )}
            </span>

            <Button size="md" onClick={applyBulkApprove} disabled={pending || selectedBinaryIds.length === 0}>
              Approve {selectedBinaryIds.length}
            </Button>

            <div className="flex items-center gap-1.5">
              <select
                value={bulkRejectReason}
                onChange={(e) => setBulkRejectReason(e.target.value)}
                className="h-10 rounded-xl border border-border bg-input px-3 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Rejection reason…</option>
                {rejectionReasons.map((r) => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
              <Button
                variant="outline"
                size="md"
                onClick={applyBulkReject}
                disabled={pending || selectedBinaryIds.length === 0 || !bulkRejectReason}
              >
                Reject {selectedBinaryIds.length}
              </Button>
            </div>

            {bulkError && <p className="text-sm font-medium text-danger">{bulkError}</p>}

            <button
              onClick={clearSelection}
              aria-label="Clear selection"
              className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActiveId(null)} aria-hidden />
          <div className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-foreground">{active.campaignName}</h2>
                <p className="truncate text-sm text-muted-foreground">
                  {active.storeName} · {active.submittedByName ?? "Unknown"} · {fmt(active.submittedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={activeIndex <= 0}
                  aria-label="Previous submission"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-1 text-xs font-medium text-muted-foreground">
                  {activeIndex + 1} of {visibleReviews.length}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={activeIndex >= visibleReviews.length - 1}
                  aria-label="Next submission"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveId(null)}
                  aria-label="Close"
                  className="ml-1 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Submission</p>
                <div className="grid grid-cols-2 gap-2">
                  {active.photos.map((u) => (
                    <button key={u} type="button" onClick={() => setExpandedPhoto(u)} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="Submission" className="aspect-square w-full rounded-lg border border-border object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                        <ZoomIn className="h-5 w-5 text-white" />
                      </span>
                    </button>
                  ))}
                  {active.photos.length === 0 && <p className="text-sm text-muted-foreground">No photos.</p>}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Reference</p>
                <div className="grid grid-cols-2 gap-2">
                  {active.referenceImages.map((u) => (
                    <button key={u} type="button" onClick={() => setExpandedPhoto(u)} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="Reference" className="aspect-square w-full rounded-lg border border-border object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                        <ZoomIn className="h-5 w-5 text-white" />
                      </span>
                    </button>
                  ))}
                  {active.referenceImages.length === 0 && <p className="text-sm text-muted-foreground">No reference.</p>}
                </div>
              </div>
            </div>

            {(active.geofenceFlag || active.duplicateFlag || active.noLocationFlag) && (
              <div className="mt-4 space-y-1 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
                {active.geofenceFlag && (
                  <p className="flex items-center gap-2 text-foreground">
                    <MapPinOff className="h-4 w-4 text-warning" />
                    Photo taken {active.geofenceDistanceM != null ? `${active.geofenceDistanceM} m` : "far"} from the
                    store&apos;s location.
                  </p>
                )}
                {active.duplicateFlag && (
                  <p className="flex items-center gap-2 text-foreground">
                    <CopyX className="h-4 w-4 text-danger" />
                    One or more photos match an earlier submission (possible reuse).
                  </p>
                )}
                {active.noLocationFlag && (
                  <p className="flex items-center gap-2 text-foreground">
                    <LocateOff className="h-4 w-4 text-muted-foreground" />
                    No GPS location was captured for this submission.
                  </p>
                )}
              </div>
            )}

            {active.comments && (
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Comments:</span> {active.comments}
              </p>
            )}

            {active.skuRequirement && (
              <div className="mt-4 rounded-xl border border-border p-4">
                <p className="text-sm font-medium text-foreground">Required on shelf</p>
                {active.skuRequirement.mode === "all" ? (
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {active.skus.map((s) => (
                      <li key={s.id} className="flex items-center justify-between">
                        <span>{s.skuName}</span>
                        <span className="text-xs">
                          {[s.shelf, s.qty != null ? `${s.qty} facings` : null].filter(Boolean).join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : active.skuRequirement.mode === "any_list" ? (
                  <div className="mt-2 text-sm text-muted-foreground">
                    <p>
                      At least <span className="font-medium text-foreground">{active.skuRequirement.minProducts ?? "—"}</span> of the approved list
                      {active.skuRequirement.shelf ? `, on ${active.skuRequirement.shelf}` : ""}
                      {active.skuRequirement.qty != null ? `, ${active.skuRequirement.qty} facings each` : ""}.
                    </p>
                    <p className="mt-1 text-xs">{active.skus.map((s) => s.skuName).join(", ")}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    At least <span className="font-medium text-foreground">{active.skuRequirement.minProducts ?? "—"}</span> different products from{" "}
                    <span className="font-medium text-foreground">{active.skuRequirement.category ?? "the category"}</span>
                    {active.skuRequirement.shelf ? `, on ${active.skuRequirement.shelf}` : ""}
                    {active.skuRequirement.qty != null ? `, ${active.skuRequirement.qty} facings total` : ""}.
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground/70">
                  This is the requirement, for reference — checking it against the photo is still your judgment call.
                </p>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">AI assessment</p>
                {/* Admin always gets the toggle; non-admin only when the campaign allows it */}
                {(isAdmin || active.aiScoreVisible) && (
                  <button
                    type="button"
                    onClick={() => setShowAi((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {showAi ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showAi ? "Hide (prevent bias)" : "Reveal AI"}
                  </button>
                )}
              </div>
              {/* Non-admin reviewer on a hidden campaign: permanently locked out */}
              {!isAdmin && !active.aiScoreVisible ? (
                <p className="mt-2 text-sm text-muted-foreground">Hidden for this campaign — decide independently.</p>
              ) : showAi ? (
                active.aiScore != null ? (
                  <div className="mt-2 text-sm text-muted-foreground">
                    <p>
                      <span className="font-semibold text-foreground">{active.aiScore}/10</span>
                      {" · "}
                      {active.payoutModel === "tiered"
                        ? (aiSuggestedTier(active.aiScore, active.payoutTiers)?.label ?? active.aiVerdict)
                        : active.aiVerdict}
                      {active.payoutModel === "tiered" && (
                        <span className="ml-1 text-xs opacity-60">(AI suggestion)</span>
                      )}
                    </p>
                    {active.aiAssessment && (
                      <ul className="mt-1 list-inside list-disc whitespace-pre-line">
                        {active.aiAssessment}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No AI score (not configured or pending) — use your judgment.
                  </p>
                )
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Hidden — decide first, then reveal.</p>
              )}
            </div>

            {active.payoutModel === "tiered" && active.payoutTiers.length > 0 ? (
              /* ── Tiered: reviewer clicks a tier label button ── */
              <div className="mt-5 space-y-2">
                <p className="text-sm font-medium text-foreground">Select verdict</p>
                {pendingTier ? (
                  /* Step 2 — rejection reason for 0% tiers */
                  <div className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
                    <p className="text-sm font-medium text-foreground">
                      Rejecting as <span className="text-danger">{pendingTier.label}</span> — select a reason
                    </p>
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
                    {error && <p className="text-sm font-medium text-danger">{error}</p>}
                    <div className="flex gap-2">
                      <Button variant="outline" size="md" onClick={() => { setPendingTier(null); setReason(""); setError(null); }}>
                        Back
                      </Button>
                      <Button
                        size="md"
                        disabled={pending || !reason}
                        onClick={() => {
                          start(async () => {
                            const res = await selectPayoutTier(active.id, pendingTier.label, pendingTier.pct, reason);
                            if (res?.error) setError(res.error);
                            else advanceAfterVerdict();
                          });
                        }}
                      >
                        {pending ? "Saving…" : "Confirm rejection"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {active.payoutTiers.map((tier) => {
                      const cls =
                        tier.pct === 100
                          ? "border-success/40 bg-success/10 text-success hover:bg-success/20"
                          : tier.pct === 0
                          ? "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20"
                          : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/20";
                      return (
                        <button
                          key={tier.label}
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (tier.pct === 0) {
                              // Ask for rejection reason before submitting
                              setPendingTier(tier);
                              setReason("");
                              setError(null);
                            } else {
                              start(async () => {
                                const res = await selectPayoutTier(active.id, tier.label, tier.pct);
                                if (res?.error) setError(res.error);
                                else advanceAfterVerdict();
                              });
                            }
                          }}
                          className={cn(
                            "rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                            cls,
                          )}
                        >
                          {tier.label || `${tier.pct}%`}
                          <span className="ml-2 text-xs opacity-70">({tier.pct}%)</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!pendingTier && error && <p className="mt-1 text-sm font-medium text-danger">{error}</p>}
              </div>
            ) : (
              /* ── Binary: existing approve / reject flow ── */
              <>
                {!rejecting && (
                  <div className="mt-4 space-y-1.5">
                    <label className="block text-sm font-medium text-foreground">
                      Your score /10{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      value={reviewerScore}
                      onChange={(e) => setReviewerScore(e.target.value)}
                      placeholder="e.g. 8"
                      className="w-32 rounded-xl border border-transparent bg-input px-4 py-2 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                )}

                {rejecting && (
                  <div className="mt-4 space-y-1.5">
                    <label className="block text-sm font-medium text-foreground">
                      Rejection reason (required)
                    </label>
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

                <div className="mt-5 flex justify-end gap-2">
                  {!rejecting ? (
                    <>
                      <Button variant="outline" size="md" onClick={() => setRejecting(true)}>
                        Reject
                      </Button>
                      <Button size="md" onClick={approve} disabled={pending}>
                        {pending ? "Saving…" : "Approve"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" size="md" onClick={() => setRejecting(false)}>
                        Back
                      </Button>
                      <Button size="md" onClick={reject} disabled={pending}>
                        {pending ? "Saving…" : "Confirm rejection"}
                      </Button>
                    </>
                  )}
                </div>
              </>
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
          <img
            src={expandedPhoto}
            alt="Full size"
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          />
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
