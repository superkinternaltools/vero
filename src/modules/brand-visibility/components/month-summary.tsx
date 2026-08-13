"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, ZoomIn } from "lucide-react";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import { approveSubmission, rejectSubmission, selectPayoutTier } from "@/modules/review/actions";
import type { Matrix, CellData } from "@/modules/summary/queries";
import type { PayoutTier } from "@/modules/campaigns/types";
import type { ContestListRow, MonthListRow, SkuRequirement, SkuRow } from "../types";

/* Mirrors summary-client.tsx's cell display exactly (kept duplicated on
 * purpose — that file stays untouched so the existing Campaigns tab carries
 * zero risk from this addition). */
const CELL: Record<string, { cls: string; label: string }> = {
  approved: { cls: "bg-success/15 text-success", label: "Appr" },
  rejected: { cls: "bg-danger/15 text-danger", label: "Rej" },
  submitted: { cls: "bg-info/15 text-info", label: "Sub" },
  pending: { cls: "bg-warning/15 text-warning", label: "Pend" },
  missed: { cls: "bg-muted text-muted-foreground", label: "Miss" },
  not_done: { cls: "bg-muted text-muted-foreground", label: "Can't" },
};

function tierColor(tiers: PayoutTier[], label: string): string {
  const tier = tiers.find((t) => t.label === label);
  if (!tier) return "bg-muted text-muted-foreground";
  if (tier.pct === 100) return "bg-success/15 text-success";
  if (tier.pct === 0) return "bg-danger/15 text-danger";
  return "bg-warning/15 text-warning";
}

function cellDisplay(c: CellData, payoutModel: string, payoutTiers: PayoutTier[]): { label: string; cls: string; aiOnly?: boolean } {
  if (c.humanVerdict) {
    if (payoutModel === "tiered" && c.payoutTierLabel) {
      return { label: c.payoutTierLabel, cls: tierColor(payoutTiers, c.payoutTierLabel) };
    }
    return CELL[c.status] ?? { label: c.status, cls: "bg-muted text-muted-foreground" };
  }
  if (c.aiVerdict) {
    const matchedTier = payoutTiers.find((t) => t.label === c.aiVerdict);
    if (matchedTier) return { label: c.aiVerdict, cls: tierColor(payoutTiers, c.aiVerdict), aiOnly: true };
    const isApproved = c.aiVerdict === "approved";
    return { label: isApproved ? "Appr" : "Rej", cls: isApproved ? "bg-success/15 text-success" : "bg-danger/15 text-danger", aiOnly: true };
  }
  return CELL[c.status] ?? { label: c.status, cls: "bg-muted text-muted-foreground" };
}

function fmtCycle(d: string): string {
  const [, m, day] = d.split("-").map(Number);
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${MONTHS[m - 1]} ${day}`;
}

function requirementLine(requirement: SkuRequirement, skus: SkuRow[]): string {
  if (requirement.mode === "all") {
    return `All of: ${skus.map((s) => s.skuName).filter(Boolean).join(", ") || "—"}`;
  }
  if (requirement.mode === "any_list") {
    return `At least ${requirement.minProducts ?? "—"} of: ${skus.map((s) => s.skuName).filter(Boolean).join(", ") || "—"}`;
  }
  return `At least ${requirement.minProducts ?? "—"} from "${requirement.category ?? "—"}"`;
}

export function MonthSummary({
  contests,
  months,
  selectedContestId,
  selectedMonthId,
  matrix,
  requirement,
  skus,
  rejectionReasons,
}: {
  contests: ContestListRow[];
  months: MonthListRow[];
  selectedContestId: string | null;
  selectedMonthId: string | null;
  matrix: Matrix | null;
  requirement: SkuRequirement | null;
  skus: SkuRow[];
  rejectionReasons: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cellKey, setCellKey] = useState<{ storeId: string; cycle: string } | null>(null);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickContest(id: string) {
    router.push(id ? `/summary?tab=brand-visibility&contest=${id}` : "/summary?tab=brand-visibility");
  }
  function pickMonth(id: string) {
    router.push(`/summary?tab=brand-visibility&contest=${selectedContestId}${id ? `&month=${id}` : ""}`);
  }
  function closeCell() {
    setCellKey(null);
    setReason("");
    setRejecting(false);
    setError(null);
  }

  const cell: CellData | null = cellKey && matrix ? matrix.cells[cellKey.storeId]?.[cellKey.cycle] ?? null : null;
  const storeName = cellKey && matrix ? matrix.stores.find((s) => s.id === cellKey.storeId)?.name ?? "—" : "";

  function approve() {
    if (!cell?.submissionId) return;
    start(async () => {
      const res = await approveSubmission(cell.submissionId!);
      if (res?.error) setError(res.error);
      else {
        closeCell();
        router.refresh();
      }
    });
  }
  function reject() {
    if (!cell?.submissionId) return;
    if (!reason) {
      setError("Pick a rejection reason.");
      return;
    }
    start(async () => {
      const res = await rejectSubmission(cell.submissionId!, reason);
      if (res?.error) setError(res.error);
      else {
        closeCell();
        router.refresh();
      }
    });
  }
  function pickTier(tier: PayoutTier) {
    if (!cell?.submissionId) return;
    start(async () => {
      const res = await selectPayoutTier(cell.submissionId!, tier.label, tier.pct);
      if (res?.error) setError(res.error);
      else {
        closeCell();
        router.refresh();
      }
    });
  }

  return (
    <div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">Summary</h1>
      <p className="mt-1 text-sm text-muted-foreground">Brand visibility — pick a contest and month.</p>

      <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Campaign</label>
          <select
            value={selectedContestId ?? ""}
            onChange={(e) => pickContest(e.target.value)}
            className="h-11 w-full rounded-xl border border-transparent bg-input px-3 text-sm text-foreground focus:border-primary focus:bg-background focus:outline-none"
          >
            <option value="">Select a contest…</option>
            {contests.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Month</label>
          <select
            value={selectedMonthId ?? ""}
            onChange={(e) => pickMonth(e.target.value)}
            disabled={!selectedContestId}
            className="h-11 w-full rounded-xl border border-transparent bg-input px-3 text-sm text-foreground focus:border-primary focus:bg-background focus:outline-none disabled:opacity-50"
          >
            <option value="">Select a month…</option>
            {months.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedContestId && (
        <p className="mt-6 text-center text-sm text-muted-foreground">Pick a contest to see its compliance grid.</p>
      )}
      {selectedContestId && !selectedMonthId && (
        <p className="mt-6 text-center text-sm text-muted-foreground">Pick a month.</p>
      )}
      {selectedMonthId && !matrix && (
        <p className="mt-6 text-center text-sm text-muted-foreground">No data for this month yet.</p>
      )}

      {matrix && requirement && (
        <div className="mt-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Required: </span>
          {requirementLine(requirement, skus)}
        </div>
      )}

      {matrix && (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Store</th>
                {matrix.cycles.map((cyc) => (
                  <th key={cyc} className="px-3 py-3 text-center font-semibold">{fmtCycle(cyc)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.stores.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-foreground">{s.name}</td>
                  {matrix.cycles.map((cyc) => {
                    const c = matrix.cells[s.id]?.[cyc];
                    if (!c) return <td key={cyc} className="px-3 py-2.5 text-center text-muted-foreground">—</td>;
                    const d = cellDisplay(c, matrix.payoutModel, matrix.payoutTiers);
                    return (
                      <td key={cyc} className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => setCellKey({ storeId: s.id, cycle: cyc })}
                          className={cn("inline-flex min-w-14 items-center justify-center rounded-lg px-2 py-1 text-xs font-medium", d.cls, d.aiOnly && "opacity-70 ring-1 ring-dashed ring-current")}
                          title={d.aiOnly ? "AI only — no human verdict yet" : undefined}
                        >
                          {d.label}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {matrix.stores.length === 0 && (
                <tr>
                  <td colSpan={matrix.cycles.length + 1} className="p-10 text-center text-sm text-muted-foreground">
                    No stores on this month yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {cellKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeCell} aria-hidden />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{storeName}</h2>
                <p className="text-sm text-muted-foreground">{fmtCycle(cellKey.cycle)}</p>
              </div>
              <button type="button" onClick={closeCell} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!cell ? (
              <p className="text-sm text-muted-foreground">Nothing submitted for this week.</p>
            ) : (
              <>
                {cell.photos.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {cell.photos.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer" className="group relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="Submission" className="aspect-square w-full rounded-lg border border-border object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                          <ZoomIn className="h-5 w-5 text-white" />
                        </span>
                      </a>
                    ))}
                  </div>
                )}
                {requirement && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Required: </span>
                    {requirementLine(requirement, skus)}
                  </p>
                )}
                {cell.aiAssessment && (
                  <div className="mt-3 rounded-xl border border-border p-3 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{cell.aiScore}/10</span> — {cell.aiAssessment}
                  </div>
                )}
                {cell.rejectionReason && (
                  <p className="mt-3 text-sm font-medium text-danger">Rejected: {cell.rejectionReason}</p>
                )}

                {cell.submissionId && (
                  <div className="mt-5">
                    {matrix!.payoutModel === "tiered" && matrix!.payoutTiers.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {matrix!.payoutTiers.map((tier) => (
                          <button
                            key={tier.label}
                            type="button"
                            disabled={pending}
                            onClick={() => pickTier(tier)}
                            className={cn(
                              "rounded-xl border px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                              tier.pct === 100 ? "border-success/40 bg-success/10 text-success hover:bg-success/20" :
                              tier.pct === 0 ? "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20" :
                              "border-warning/40 bg-warning/10 text-warning hover:bg-warning/20",
                            )}
                          >
                            {tier.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <>
                        {rejecting && (
                          <select
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="mb-3 w-full rounded-xl border border-transparent bg-input px-4 py-3 text-sm text-foreground focus:border-primary focus:bg-background focus:outline-none"
                          >
                            <option value="">Select a reason…</option>
                            {rejectionReasons.map((r) => (
                              <option key={r.id} value={r.name}>{r.name}</option>
                            ))}
                          </select>
                        )}
                        <div className="flex justify-end gap-2">
                          {!rejecting ? (
                            <>
                              <Button variant="outline" size="md" onClick={() => setRejecting(true)}>Reject</Button>
                              <Button size="md" onClick={approve} disabled={pending}>{pending ? "Saving…" : "Approve"}</Button>
                            </>
                          ) : (
                            <>
                              <Button variant="outline" size="md" onClick={() => setRejecting(false)}>Back</Button>
                              <Button size="md" onClick={reject} disabled={pending}>{pending ? "Saving…" : "Confirm rejection"}</Button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
