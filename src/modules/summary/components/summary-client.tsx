"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, X } from "lucide-react";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import type { Matrix, CellData } from "../queries";
import { approveSubmission, rejectSubmission } from "@/modules/review/actions";

const CELL: Record<string, { cls: string; label: string }> = {
  approved: { cls: "bg-success/15 text-success", label: "Appr" },
  rejected: { cls: "bg-danger/15 text-danger", label: "Rej" },
  submitted: { cls: "bg-info/15 text-info", label: "Sub" },
  pending: { cls: "bg-warning/15 text-warning", label: "Pend" },
  missed: { cls: "bg-muted text-muted-foreground", label: "Miss" },
  not_done: { cls: "bg-muted text-muted-foreground", label: "N/D" },
};

function fmtCycle(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function SummaryClient({
  campaigns,
  selectedId,
  matrix,
  rejectionReasons,
}: {
  campaigns: { id: string; name: string }[];
  selectedId: string | null;
  matrix: Matrix | null;
  rejectionReasons: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cell, setCell] = useState<{ data: CellData; store: string; cycle: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function exportCsv() {
    if (!matrix) return;
    const header = ["Store", ...matrix.cycles.map(fmtCycle)].join(",");
    const lines = matrix.stores.map((s) => {
      const row = matrix.cycles.map((cy) => {
        const c = matrix.cells[s.id]?.[cy];
        return c ? (CELL[c.status]?.label ?? c.status) : "";
      });
      return [`"${s.name}"`, ...row].join(",");
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
    setReason("");
    setError(null);
  }

  function approve() {
    if (!cell?.data.submissionId) return;
    start(async () => {
      const res = await approveSubmission(cell.data.submissionId!);
      if (res?.error) setError(res.error);
      else {
        setCell(null);
        router.refresh();
      }
    });
  }

  function reject() {
    if (!cell?.data.submissionId) return;
    if (!reason) {
      setError("Pick a reason.");
      return;
    }
    start(async () => {
      const res = await rejectSubmission(cell.data.submissionId!, reason);
      if (res?.error) setError(res.error);
      else {
        setCell(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Summary</h1>
          <p className="mt-1 text-sm text-muted-foreground">Week-on-week verdicts per store.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedId ?? ""}
            onChange={(e) =>
              router.push(e.target.value ? `/summary?campaign=${e.target.value}` : "/summary")
            }
            className="rounded-xl border border-transparent bg-input px-4 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Select a campaign…</option>
            {campaigns.map((c) => (
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

      {!matrix && (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Pick a campaign to see its week-on-week verdict matrix.
        </div>
      )}

      {matrix && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 z-10 bg-card px-4 py-3 font-semibold">Store</th>
                {matrix.cycles.map((cy) => (
                  <th key={cy} className="px-3 py-3 text-center font-semibold">{fmtCycle(cy)}</th>
                ))}
                <th className="px-4 py-3 text-center font-semibold">Approved %</th>
              </tr>
            </thead>
            <tbody>
              {matrix.stores.map((s) => {
                const row = matrix.cells[s.id] ?? {};
                const total = matrix.cycles.length;
                const approved = matrix.cycles.filter((cy) => row[cy]?.status === "approved").length;
                return (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2.5 font-medium text-foreground">
                      {s.name}
                    </td>
                    {matrix.cycles.map((cy) => {
                      const c = row[cy];
                      const meta = c ? CELL[c.status] : null;
                      return (
                        <td key={cy} className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => openCell(s.name, cy, c)}
                            disabled={!c}
                            className={cn(
                              "inline-flex min-w-12 items-center justify-center rounded-md px-2 py-1 text-xs font-medium",
                              meta ? meta.cls : "text-muted-foreground/40",
                              c && "hover:opacity-80",
                            )}
                          >
                            {meta ? meta.label : "—"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-center text-muted-foreground">
                      {total ? Math.round((approved / total) * 100) : 0}%
                    </td>
                  </tr>
                );
              })}
              {matrix.stores.length === 0 && (
                <tr>
                  <td colSpan={matrix.cycles.length + 2} className="p-10 text-center text-sm text-muted-foreground">
                    No tasks generated for this campaign yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {cell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCell(null)} aria-hidden />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {cell.store} · {fmtCycle(cell.cycle)}
              </h2>
              <button type="button" onClick={() => setCell(null)} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm capitalize text-muted-foreground">
              Status: <span className="font-medium text-foreground">{cell.data.status}</span>
              {cell.data.aiScore != null && ` · AI ${cell.data.aiScore}/10`}
            </p>
            {cell.data.rejectionReason && (
              <p className="mt-1 text-sm text-danger">{cell.data.rejectionReason}</p>
            )}
            {cell.data.photos.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {cell.data.photos.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="Proof" className="aspect-square w-full rounded-lg border border-border object-cover" />
                ))}
              </div>
            )}

            {cell.data.submissionId && (
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
