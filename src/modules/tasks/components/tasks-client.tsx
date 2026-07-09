"use client";

import { useEffect, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Calendar,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  AlertTriangle,
  Images,
  Send,
  Search,
  Timer,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/core/ui/button";
import { createClient } from "@/core/db/client";
import { cn } from "@/core/lib/utils";
import type { TaskRow } from "../types";
import { submitProof, markNonSubmission, deleteTask } from "../actions";

const PAGE_SIZE = 15;

function fmtDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function displayDue(t: TaskRow) {
  return fmtDate(t.frequency === "daily" ? t.dueDate : t.cycleEnd);
}

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function cycleLabel(t: TaskRow) {
  if (t.frequency === "daily") return fmtDate(t.cycleStart);
  return `${fmtDate(t.cycleStart)} – ${fmtDate(t.cycleEnd)}`;
}

function isInCycleWindow(t: TaskRow): boolean {
  const today = new Date().toISOString().split("T")[0];
  return today >= t.cycleStart && today <= t.cycleEnd;
}

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Clock; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (n: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="mt-2 flex items-center justify-between px-1 py-2">
      <span className="text-xs text-muted-foreground">
        {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
      </span>
      <div className="flex gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  submitted: "bg-info/10 text-info",
  approved: "bg-success/10 text-success",
  rejected: "bg-danger/10 text-danger",
  missed: "bg-muted text-muted-foreground",
  not_done: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  missed: "Missed",
  not_done: "Not done",
};

export function TasksClient({
  tasks,
  nonSubmissionReasons,
  isAdmin,
}: {
  tasks: TaskRow[];
  nonSubmissionReasons: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [active, setActive] = useState<TaskRow | null>(null);
  const [viewTask, setViewTask] = useState<TaskRow | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [hashes, setHashes] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingPage, setPendingPage] = useState(1);
  const [awaitingPage, setAwaitingPage] = useState(1);
  const [approvedPage, setApprovedPage] = useState(1);

  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "pending" | "submitted" | "approved" | "rejected">("");

  const uniqueStores = [...new Set(tasks.map((t) => t.storeName))].sort();

  const filtered = tasks.filter((t) => {
    if (search && !t.campaignName.toLowerCase().includes(search.toLowerCase())) return false;
    if (storeFilter && t.storeName !== storeFilter) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    return true;
  });

  useEffect(() => {
    if (active && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setCoords({ lat: null, lng: null }),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
  }, [active]);

  const pendingTasks = filtered.filter((t) => t.status === "pending" || t.status === "missed");
  const awaitingTasks = filtered.filter((t) => t.status === "submitted" || t.status === "rejected");
  const approvedTasks = filtered.filter((t) => t.status === "approved");
  const notDoneTasks = filtered.filter((t) => t.status === "not_done");
  const needAttention = tasks.filter((t) => t.status === "rejected" || t.status === "missed").length;

  function open(t: TaskRow) {
    setActive(t);
    setComments("");
    setPhotos([]);
    setHashes([]);
    setCoords({ lat: null, lng: null });
    setError(null);
  }

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !active) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const urls: string[] = [];
    const newHashes: string[] = [];
    for (const file of Array.from(files).slice(0, active.numPhotos)) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${active.id}/${crypto.randomUUID()}-${safe}`;
      const [{ error: upErr }, digest] = await Promise.all([
        supabase.storage.from("submissions").upload(path, file),
        sha256(file),
      ]);
      if (upErr) {
        setError(upErr.message);
        continue;
      }
      urls.push(supabase.storage.from("submissions").getPublicUrl(path).data.publicUrl);
      newHashes.push(digest);
    }
    setPhotos((p) => [...p, ...urls].slice(0, active.numPhotos));
    setHashes((p) => [...p, ...newHashes].slice(0, active.numPhotos));
    setUploading(false);
    e.target.value = "";
  }

  function submit() {
    if (!active) return;
    start(async () => {
      const res = await submitProof({
        taskId: active.id,
        campaignId: active.campaignId,
        storeId: active.storeId,
        photos,
        photoHashes: hashes,
        comments,
        latitude: coords.lat,
        longitude: coords.lng,
      });
      if (res?.error) setError(res.error);
      else {
        setActive(null);
        router.refresh();
      }
    });
  }

  function cantDo(t: TaskRow, reason: string) {
    if (!reason) return;
    if (!window.confirm(`Mark "${t.campaignName}" as not done?\nReason: ${reason}`)) return;
    start(async () => {
      const res = await markNonSubmission(t.id, reason);
      if (res?.error) window.alert(res.error);
      router.refresh();
    });
  }

  function remove(t: TaskRow) {
    if (!window.confirm(`Delete this task for "${t.campaignName}" at ${t.storeName}?`)) return;
    start(async () => {
      const res = await deleteTask(t.id);
      if (res?.error) window.alert(res.error);
      router.refresh();
    });
  }

  const pPending = pendingTasks.slice((pendingPage - 1) * PAGE_SIZE, pendingPage * PAGE_SIZE);
  const pAwaiting = awaitingTasks.slice((awaitingPage - 1) * PAGE_SIZE, awaitingPage * PAGE_SIZE);
  const pApproved = approvedTasks.slice((approvedPage - 1) * PAGE_SIZE, approvedPage * PAGE_SIZE);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tasks</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your assigned executions.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Assigned" value={tasks.length} icon={ClipboardList} tone="bg-info/10 text-info" />
        <Kpi label="Pending" value={pendingTasks.length} icon={Clock} tone="bg-warning/10 text-warning" />
        <Kpi label="Submitted" value={awaitingTasks.length + approvedTasks.length} icon={Send} tone="bg-success/10 text-success" />
        <Kpi label="Need attention" value={needAttention} icon={AlertTriangle} tone="bg-danger/10 text-danger" />
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPendingPage(1); setAwaitingPage(1); setApprovedPage(1); }}
            placeholder="Search campaign…"
            className="w-full rounded-xl border border-transparent bg-input py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {uniqueStores.length > 1 && (
          <select
            value={storeFilter}
            onChange={(e) => { setStoreFilter(e.target.value); setPendingPage(1); }}
            className="rounded-xl border border-transparent bg-input px-3 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
          >
            <option value="">All stores</option>
            {uniqueStores.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPendingPage(1); setAwaitingPage(1); setApprovedPage(1); }}
          className="rounded-xl border border-transparent bg-input px-3 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        {(search || storeFilter || statusFilter) && (
          <button
            type="button"
            onClick={() => { setSearch(""); setStoreFilter(""); setStatusFilter(""); }}
            className="rounded-xl border border-border px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted"
          >
            Clear
          </button>
        )}
      </div>

      {/* Pending */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">Pending Executions</h2>
        <div className="mt-3 space-y-3">
          {pPending.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug text-foreground">{t.campaignName}</p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    disabled={pending}
                    className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                    aria-label="Delete task"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span>{t.storeName}</span>
              </div>
              {t.windowStart && t.windowEnd && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Timer className="h-3.5 w-3.5 shrink-0" />
                  <span>{fmtTime(t.windowStart)} – {fmtTime(t.windowEnd)}</span>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>{displayDue(t)}</span>
                </div>
                <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLES[t.status])}>
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <Button className="w-full" size="md" onClick={() => open(t)}>
                  <Camera className="h-4 w-4" />
                  Upload proof
                </Button>
                <select
                  defaultValue=""
                  onChange={(e) => { cantDo(t, e.target.value); e.target.value = ""; }}
                  disabled={pending}
                  className="w-full rounded-xl border border-transparent bg-input px-3 py-2 text-xs text-muted-foreground focus:border-primary focus:outline-none"
                >
                  <option value="">Can&apos;t do it?</option>
                  {nonSubmissionReasons.map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          {pendingTasks.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nothing pending. 🎉
            </div>
          )}
        </div>
        <Pagination page={pendingPage} total={pendingTasks.length} onPage={setPendingPage} />
      </section>

      {/* Can't do it — not done */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">Can&apos;t Do It</h2>
        <div className="mt-3 space-y-3">
          {notDoneTasks.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-card p-4 opacity-70">
              <p className="text-sm font-medium leading-snug text-foreground">{t.campaignName}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span>{t.storeName}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>{displayDue(t)}</span>
                </div>
                <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLES.not_done)}>
                  Can&apos;t do it
                </span>
              </div>
              {t.nonSubmissionReason && (
                <p className="mt-2 text-xs text-muted-foreground">Reason: {t.nonSubmissionReason}</p>
              )}
            </div>
          ))}
          {notDoneTasks.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No tasks marked as can&apos;t do it.
            </div>
          )}
        </div>
      </section>

      {/* Submitted — not approved */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">Submitted — Not Approved</h2>
        <div className="mt-3 space-y-3">
          {pAwaiting.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-medium leading-snug text-foreground">{t.campaignName}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span>{t.storeName}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>{displayDue(t)}</span>
                </div>
                <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLES[t.status])}>
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
              </div>
              {t.status === "rejected" && t.rejectionReason && (
                <div className="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-3">
                  <p className="text-xs font-medium text-danger">{t.rejectionReason}</p>
                </div>
              )}
              <div className="mt-3">
                {t.status === "rejected" ? (
                  <Button variant="outline" className="w-full" size="md" onClick={() => open(t)}>
                    Re-upload
                  </Button>
                ) : (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setViewTask(t)}
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      View submitted photo
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {awaitingTasks.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No submissions awaiting review.
            </div>
          )}
        </div>
        <Pagination page={awaitingPage} total={awaitingTasks.length} onPage={setAwaitingPage} />
      </section>

      {/* Approved */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">Submitted — Approved</h2>
        <div className="mt-3 space-y-3">
          {pApproved.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-medium leading-snug text-foreground">{t.campaignName}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span>{t.storeName}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>{displayDue(t)}</span>
                </div>
                <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLES[t.status])}>
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {(isAdmin || isInCycleWindow(t)) && (
                  <Button variant="outline" className="w-full" size="md" onClick={() => open(t)}>
                    Re-submit
                  </Button>
                )}
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setViewTask(t)}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    View submitted photo
                  </button>
                </div>
              </div>
            </div>
          ))}
          {approvedTasks.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No approved executions yet.
            </div>
          )}
        </div>
        <Pagination page={approvedPage} total={approvedTasks.length} onPage={setApprovedPage} />
      </section>


      {/* Upload / re-upload modal */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActive(null)} aria-hidden />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {active.status === "rejected" ? "Re-upload Execution Photo" : active.status === "approved" ? "Re-submit Execution Photo" : "Upload Execution Photo"}
              </h2>
              <button type="button" onClick={() => setActive(null)} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            {active.status === "rejected" && active.rejectionReason && (
              <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-3">
                <p className="text-sm font-medium text-danger">Rejected: {active.rejectionReason}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Fix the issue above before re-uploading.</p>
              </div>
            )}
            {active.status === "approved" && (
              <div className="mb-4 rounded-xl border border-success/30 bg-success/5 p-3">
                <p className="text-sm font-medium text-success">This task is already approved.</p>
                <p className="mt-0.5 text-xs text-muted-foreground">A new submission will go back for review and replace the current approval if it scores better.</p>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Reference</p>
                {active.referenceImages.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {active.referenceImages.map((url) => (
                      <button key={url} type="button" onClick={() => setExpandedPhoto(url)} className="group relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Reference" className="aspect-square w-full rounded-lg border border-border object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                          <ZoomIn className="h-5 w-5 text-white" />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No reference image.</p>
                )}
              </div>
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-sm font-medium text-foreground">Instructions</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {active.instructions || "No instructions provided."}
                </p>
              </div>
            </div>

            {photos.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {photos.map((url) => (
                  <button key={url} type="button" onClick={() => setExpandedPhoto(url)} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Upload" className="aspect-square w-full rounded-lg border border-border object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                      <ZoomIn className="h-5 w-5 text-white" />
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <input
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Comments (optional)"
                className="w-full rounded-xl border border-transparent bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
                  <input
                    type="file"
                    accept="image/*"
                    multiple={active.numPhotos > 1}
                    capture="environment"
                    className="hidden"
                    onChange={onFiles}
                    disabled={uploading}
                  />
                  <Camera className="h-4 w-4" />
                  {uploading ? "Uploading…" : "Take photo"}
                </label>
                {active.captureMode !== "camera" && (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
                    <input
                      type="file"
                      accept="image/*"
                      multiple={active.numPhotos > 1}
                      className="hidden"
                      onChange={onFiles}
                      disabled={uploading}
                    />
                    <Images className="h-4 w-4" />
                    Choose from gallery
                  </label>
                )}
                <span className="text-xs text-muted-foreground">
                  {coords.lat ? "📍 Location captured" : "📍 Location pending…"}
                </span>
              </div>
              {error && <p className="text-sm font-medium text-danger">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="md" onClick={() => setActive(null)}>Cancel</Button>
                <Button size="md" onClick={submit} disabled={pending || uploading || photos.length === 0}>
                  {pending ? "Submitting…" : "Submit proof"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View submission detail (submitted / approved) */}
      {viewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setViewTask(null)} aria-hidden />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{viewTask.campaignName}</h2>
                <p className="text-sm text-muted-foreground">{viewTask.storeName} · {displayDue(viewTask)}</p>
              </div>
              <button type="button" onClick={() => setViewTask(null)} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[viewTask.status])}>
              {viewTask.status.replace("_", " ")}
            </span>
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-foreground">Submitted photos</p>
              {viewTask.submittedPhotos.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {viewTask.submittedPhotos.map((url) => (
                    <button key={url} type="button" onClick={() => setExpandedPhoto(url)} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Submission" className="aspect-square w-full rounded-lg border border-border object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                        <ZoomIn className="h-5 w-5 text-white" />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No photos on record.</p>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" size="md" onClick={() => setViewTask(null)}>Close</Button>
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
