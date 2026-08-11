"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Images } from "lucide-react";
import { Button } from "@/core/ui/button";
import { MultiSelect } from "@/core/ui/multi-select";
import { getPhotoManifest } from "../actions";
import type { CampaignOption, DepartmentOption, ExportGroupRow, PhotoExportItem } from "../types";

/** File System Access API — Chrome and Edge only, so it isn't in the TS lib
 * types. Only the bits used below are declared. */
type SaveFilePicker = (opts: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }>;

/** Strips characters that break folder/file names on Windows and macOS. */
function safeName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Unnamed";
}

function extFromUrl(url: string): string {
  const m = url.split("?")[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  return m ? m[1].toLowerCase() : "jpg";
}

/** "Cool Drink - July - 2026-07 W2_approved.jpg" — campaign, when, and verdict,
 * with an index only when one submission carried several photos. */
function photoFileName(it: PhotoExportItem): string {
  const suffix = it.photoCount > 1 ? ` (${it.photoIndex})` : "";
  return `${safeName(it.campaignName)} - ${it.month} W${it.week}_${safeName(it.verdict)}${suffix}.${extFromUrl(it.url)}`;
}

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const lines = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function money(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function ExportClient({
  month,
  campaigns,
  departments,
  rows,
}: {
  month: string;
  campaigns: CampaignOption[];
  departments: DepartmentOption[];
  rows: ExportGroupRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [activeOnly, setActiveOnly] = useState(false);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);

  // ── Photo zip ────────────────────────────────────────────────────────────
  const [photoFrom, setPhotoFrom] = useState(month);
  const [photoTo, setPhotoTo] = useState(month);
  const [zipping, setZipping] = useState(false);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);

  function navigateMonth(next: string) {
    startTransition(() => router.replace(`/export?month=${next}`, { scroll: false }));
  }

  const visibleCampaignIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of campaigns) {
      if (campaignIds.length && !campaignIds.includes(c.id)) continue;
      if (activeOnly && c.status !== "active") continue;
      const deptOk = departmentIds.length === 0 || c.departmentIds.length === 0 || c.departmentIds.some((d) => departmentIds.includes(d));
      if (!deptOk) continue;
      set.add(c.id);
    }
    return set;
  }, [campaigns, campaignIds, activeOnly, departmentIds]);

  const visibleRows = useMemo(() => rows.filter((r) => visibleCampaignIds.has(r.campaignId)), [rows, visibleCampaignIds]);

  const totalExpected = visibleRows.reduce((s, r) => s + r.expectedPayout, 0);
  const totalActual = visibleRows.reduce((s, r) => s + r.actualPayout, 0);
  const gapWarning = totalExpected > 0 && totalActual === 0;

  function exportPayout() {
    downloadCsv(
      `payouts-${month}.csv`,
      ["Store code", "Store name", "Campaign", "Month", "Week", "Assigned", "Approved", "Payout amount"],
      visibleRows.map((r) => [r.storeCode, r.storeName, r.campaignName, r.month, r.week, r.assignedCount, r.approvedCount, r.actualPayout.toFixed(2)]),
    );
  }

  function exportSubmissionStatus() {
    downloadCsv(
      `submission-status-${month}.csv`,
      [
        "Campaign",
        "Month",
        "Store Name",
        "Week",
        "Expected Weekly",
        "Payout Tier",
        "Calculated Payout",
        // Diagnostic columns — Task Status onward blank whenever a week has more than one task.
        "Payout Model",
        "Task Status",
        "Has Submission",
        "Reviewer Score",
        "AI Score",
        "Recorded Tier Label",
      ],
      visibleRows.map((r) => [
        r.campaignName,
        r.month,
        r.storeName,
        r.week,
        r.expectedPayout.toFixed(2),
        r.statusSummary,
        r.actualPayout.toFixed(2),
        r.payoutModel,
        r.taskStatus ?? "",
        r.hasSubmission == null ? "" : r.hasSubmission ? "yes" : "no",
        r.reviewerScore ?? "",
        r.aiScore ?? "",
        r.recordedTierLabel ?? "",
      ]),
    );
  }

  async function downloadPhotos() {
    setZipError(null);
    if (campaignIds.length === 0) {
      setZipError("Pick the campaigns you want photos for, above.");
      return;
    }
    const months = photoFrom === photoTo ? [photoFrom] : [photoFrom, photoTo].sort();
    setZipping(true);
    setZipStatus("Building the list…");
    try {
      const res = await getPhotoManifest(months, campaignIds);
      if (res.error) {
        setZipError(res.error);
        return;
      }
      const items = res.items ?? [];
      if (items.length === 0) {
        setZipError("No photos found for those campaigns and months.");
        return;
      }

      const { downloadZip } = await import("client-zip");
      const suggestedName = `photos-${months.join("-and-")}.zip`;
      let done = 0;
      let failed = 0;

      // Each photo is fetched and handed to the zip encoder one at a time, so
      // only the photo in flight is ever in memory. Buffering them all is what
      // blew up before — a couple of months of photos is far more than a tab
      // can hold at once.
      async function* zipEntries() {
        for (const it of items) {
          try {
            const r = await fetch(it.url);
            if (!r.ok) throw new Error(String(r.status));
            yield {
              name: `${safeName(it.storeName)}/${photoFileName(it)}`,
              input: r,
            };
          } catch {
            failed += 1;
          }
          done += 1;
          setZipStatus(`${done} of ${items.length} photos…`);
        }
      }

      const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

      if (picker) {
        // Streams straight to the file the user picks — no size ceiling.
        const handle = await picker({
          suggestedName,
          types: [{ description: "Zip archive", accept: { "application/zip": [".zip"] } }],
        });
        const writable = await handle.createWritable();
        const body = downloadZip(zipEntries()).body;
        if (!body) throw new Error("Couldn't start the download stream.");
        await body.pipeTo(writable);
      } else {
        // Safari and Firefox have no save-picker, so fall back to holding the
        // zip in memory. Fine for a few hundred photos, not thousands.
        const blob = await downloadZip(zipEntries()).blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = suggestedName;
        a.click();
        URL.revokeObjectURL(url);
      }

      setZipStatus(
        failed > 0
          ? `Done — ${done - failed} photos, ${failed} couldn't be downloaded.`
          : `Done — ${done} photos.`,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setZipStatus(null);
        return;
      }
      setZipError(err instanceof Error ? err.message : "Something went wrong building the zip.");
    } finally {
      setZipping(false);
    }
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Export</h1>
        <p className="mt-1 text-sm text-muted-foreground">Payout and submission reports as CSV, for {monthLabel(month)}.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && navigateMonth(e.target.value)}
            className="h-11 w-full rounded-xl border border-transparent bg-input px-3 text-sm text-foreground focus:border-primary focus:bg-background focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Campaigns</label>
          <MultiSelect
            options={campaigns.map((c) => ({ id: c.id, label: c.name }))}
            selected={campaignIds}
            onChange={setCampaignIds}
            placeholder="All campaigns"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Department</label>
          <MultiSelect
            options={departments.map((d) => ({ id: d.id, label: d.name }))}
            selected={departmentIds}
            onChange={setDepartmentIds}
            placeholder="All departments"
          />
        </div>
        <div className="flex items-end pb-2.5">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Active campaigns only
          </label>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">Expected payout (if fully approved)</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{money(totalExpected)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">Actual payout (real approvals)</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{money(totalActual)}</p>
        </div>
      </div>

      {gapWarning && (
        <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          Expected payout is non-zero but actual is ₹0 — no tasks in this selection are marked <b>approved</b> yet
          for {monthLabel(month)}. Double-check you&apos;re on the right month, or that the relevant submissions have
          actually been approved in Review (not just submitted).
        </p>
      )}
      {totalExpected === 0 && visibleRows.length > 0 && (
        <p className="mt-3 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
          Expected payout is ₹0 across every row in scope — check that the relevant campaign(s) have payout enabled
          and a payout amount set, in Campaigns → Payout.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Overall payouts</h3>
          <p className="mt-1 text-xs text-muted-foreground">Per store, per week, broken out by campaign.</p>
          <p className="mt-4 text-2xl font-bold tabular-nums text-foreground">{money(totalActual)}</p>
          <p className="text-xs text-muted-foreground">{visibleRows.length} row{visibleRows.length === 1 ? "" : "s"}</p>
          <Button className="mt-4 w-full" variant="outline" onClick={exportPayout} disabled={visibleRows.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Submission status</h3>
          <p className="mt-1 text-xs text-muted-foreground">Campaign-wise, store-wise, week-wise — expected vs actual payout.</p>
          <p className="mt-4 text-2xl font-bold tabular-nums text-foreground">{visibleRows.length}</p>
          <p className="text-xs text-muted-foreground">row{visibleRows.length === 1 ? "" : "s"} in scope</p>
          <Button className="mt-4 w-full" variant="outline" onClick={exportSubmissionStatus} disabled={visibleRows.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Submission photos</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            A zip with one folder per store. Photos named by campaign, week and verdict.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">From</label>
              <input
                type="month"
                value={photoFrom}
                onChange={(e) => e.target.value && setPhotoFrom(e.target.value)}
                className="h-10 w-full rounded-xl border border-transparent bg-input px-2 text-sm text-foreground focus:border-primary focus:bg-background focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">To</label>
              <input
                type="month"
                value={photoTo}
                onChange={(e) => e.target.value && setPhotoTo(e.target.value)}
                className="h-10 w-full rounded-xl border border-transparent bg-input px-2 text-sm text-foreground focus:border-primary focus:bg-background focus:outline-none"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {campaignIds.length === 0
              ? "Select campaigns above first."
              : `${campaignIds.length} campaign${campaignIds.length === 1 ? "" : "s"} selected · saves straight to disk`}
          </p>
          {zipError && <p className="mt-2 text-xs font-medium text-danger">{zipError}</p>}
          {zipStatus && !zipError && <p className="mt-2 text-xs text-muted-foreground">{zipStatus}</p>}
          <Button
            className="mt-3 w-full"
            variant="outline"
            onClick={downloadPhotos}
            disabled={zipping || campaignIds.length === 0}
          >
            <Images className="h-4 w-4" /> {zipping ? "Preparing…" : "Download photos"}
          </Button>
        </div>
      </div>
    </div>
  );
}
