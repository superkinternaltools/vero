"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Eye, EyeOff, MapPinOff, CopyX, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import type { ReviewRow } from "../queries";
import { approveSubmission, rejectSubmission } from "../actions";

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ReviewClient({
  reviews,
  rejectionReasons,
}: {
  reviews: ReviewRow[];
  rejectionReasons: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAi, setShowAi] = useState(true);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeIndex = reviews.findIndex((r) => r.id === activeId);
  const active = activeIndex >= 0 ? reviews[activeIndex] : null;

  function open(r: ReviewRow) {
    setActiveId(r.id);
    setShowAi(r.aiScoreVisible);
    setReason("");
    setRejecting(false);
    setError(null);
  }

  const goPrev = () => activeIndex > 0 && open(reviews[activeIndex - 1]);
  const goNext = () => activeIndex < reviews.length - 1 && open(reviews[activeIndex + 1]);

  /** After a verdict, jump straight to the next item in the queue (or close if done). */
  function advanceAfterVerdict() {
    const nextItem = reviews[activeIndex + 1] ?? null;
    if (nextItem) open(nextItem);
    else setActiveId(null);
    router.refresh();
  }

  function approve() {
    if (!active) return;
    start(async () => {
      const res = await approveSubmission(active.id);
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

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Review</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {reviews.length} submission{reviews.length === 1 ? "" : "s"} awaiting review.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Campaign</th>
              <th className="px-4 py-3 font-semibold">Store</th>
              <th className="px-4 py-3 font-semibold">Department</th>
              <th className="px-4 py-3 font-semibold">AI Score</th>
              <th className="px-4 py-3 font-semibold">AI Verdict</th>
              <th className="px-4 py-3 font-semibold">Flags</th>
              <th className="px-4 py-3 font-semibold">Submitted</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{r.campaignName}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.storeName}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.departmentName ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.aiScore != null ? `${r.aiScore}/10` : "—"}
                </td>
                <td className="px-4 py-3">
                  {r.aiVerdict ? (
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                        r.aiVerdict === "approved" ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                      )}
                    >
                      {r.aiVerdict}
                    </span>
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
                    {!r.geofenceFlag && !r.duplicateFlag && (
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
            {reviews.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">
                  Nothing to review right now. 🎉
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActiveId(null)} aria-hidden />
          <div className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-foreground">{active.campaignName}</h2>
                <p className="truncate text-sm text-muted-foreground">
                  {active.storeName} · {fmt(active.submittedAt)}
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
                  {activeIndex + 1} of {reviews.length}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={activeIndex >= reviews.length - 1}
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u} src={u} alt="Submission" className="aspect-square w-full rounded-lg border border-border object-cover" />
                  ))}
                  {active.photos.length === 0 && <p className="text-sm text-muted-foreground">No photos.</p>}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Reference</p>
                <div className="grid grid-cols-2 gap-2">
                  {active.referenceImages.map((u) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u} src={u} alt="Reference" className="aspect-square w-full rounded-lg border border-border object-cover" />
                  ))}
                  {active.referenceImages.length === 0 && <p className="text-sm text-muted-foreground">No reference.</p>}
                </div>
              </div>
            </div>

            {(active.geofenceFlag || active.duplicateFlag) && (
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
              </div>
            )}

            {active.comments && (
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Comments:</span> {active.comments}
              </p>
            )}

            <div className="mt-4 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">AI assessment</p>
                <button
                  type="button"
                  onClick={() => setShowAi((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {showAi ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showAi ? "Hide (prevent bias)" : "Reveal AI"}
                </button>
              </div>
              {showAi ? (
                active.aiScore != null ? (
                  <div className="mt-2 text-sm text-muted-foreground">
                    <p>
                      <span className="font-semibold text-foreground">{active.aiScore}/10</span>{" "}
                      · {active.aiVerdict}
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

            {rejecting && (
              <div className="mt-4 space-y-1.5">
                <label className="block text-sm font-medium text-foreground">Rejection reason (required)</label>
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
          </div>
        </div>
      )}
    </div>
  );
}
