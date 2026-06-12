"use client";

import { useEffect, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, ClipboardList, Clock, Send, AlertTriangle, X } from "lucide-react";
import { Button } from "@/core/ui/button";
import { createClient } from "@/core/db/client";
import { cn } from "@/core/lib/utils";
import type { TaskRow } from "../types";
import { submitProof, markNonSubmission } from "../actions";

function fmtDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
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

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  submitted: "bg-info/10 text-info",
  approved: "bg-success/10 text-success",
  rejected: "bg-danger/10 text-danger",
  missed: "bg-muted text-muted-foreground",
  not_done: "bg-muted text-muted-foreground",
};

export function TasksClient({
  tasks,
  nonSubmissionReasons,
}: {
  tasks: TaskRow[];
  nonSubmissionReasons: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [active, setActive] = useState<TaskRow | null>(null);
  const [comments, setComments] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [hashes, setHashes] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (active && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setCoords({ lat: null, lng: null }),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
  }, [active]);

  const pendingTasks = tasks.filter((t) => t.status === "pending" || t.status === "missed");
  const awaitingTasks = tasks.filter((t) => t.status === "submitted" || t.status === "rejected");
  const approvedTasks = tasks.filter((t) => t.status === "approved");
  const notDoneTasks = tasks.filter((t) => t.status === "not_done");
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

      {/* Pending */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">Pending Executions</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Campaign</th>
                <th className="px-4 py-3 font-semibold">Store</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Upload</th>
                <th className="px-4 py-3 font-semibold">Can&apos;t do it?</th>
              </tr>
            </thead>
            <tbody>
              {pendingTasks.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{t.campaignName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.storeName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(t.dueDate)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[t.status])}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="md" onClick={() => open(t)}>Upload Photo</Button>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        cantDo(t, e.target.value);
                        e.target.value = "";
                      }}
                      disabled={pending}
                      className="rounded-lg border border-transparent bg-input px-2 py-1.5 text-xs text-muted-foreground focus:border-primary focus:outline-none"
                    >
                      <option value="">Choose a reason…</option>
                      {nonSubmissionReasons.map((r) => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {pendingTasks.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">Nothing pending. 🎉</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Submitted — not approved */}
      <TaskTable
        title="Submitted — Not Approved"
        tasks={awaitingTasks}
        emptyText="No submissions awaiting review."
        action={(t) =>
          t.status === "rejected" ? (
            <Button size="md" onClick={() => open(t)}>Re-upload</Button>
          ) : null
        }
        note={(t) => (t.status === "rejected" && t.rejectionReason ? t.rejectionReason : null)}
      />

      {/* Approved */}
      <TaskTable title="Submitted — Approved" tasks={approvedTasks} emptyText="No approved executions yet." />

      {/* Not done */}
      {notDoneTasks.length > 0 && (
        <TaskTable
          title="Closed — Not Done"
          tasks={notDoneTasks}
          emptyText=""
          note={(t) => t.nonSubmissionReason}
        />
      )}

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActive(null)} aria-hidden />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Upload Execution Photo</h2>
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label="Close"
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Reference</p>
                {active.referenceImages.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {active.referenceImages.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} alt="Reference" className="aspect-square w-full rounded-lg border border-border object-cover" />
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="Upload" className="aspect-square w-full rounded-lg border border-border object-cover" />
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
                    {...(active.captureMode === "camera" ? { capture: "environment" } : {})}
                    className="hidden"
                    onChange={onFiles}
                    disabled={uploading}
                  />
                  <Camera className="h-4 w-4" />
                  {uploading ? "Uploading…" : `Add photo${active.numPhotos > 1 ? `s (up to ${active.numPhotos})` : ""}`}
                </label>
                <span className="text-xs text-muted-foreground">
                  {coords.lat ? "📍 Location captured" : "📍 Location pending…"}
                </span>
              </div>
              {error && <p className="text-sm font-medium text-danger">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="md" onClick={() => setActive(null)}>
                  Cancel
                </Button>
                <Button size="md" onClick={submit} disabled={pending || uploading || photos.length === 0}>
                  {pending ? "Submitting…" : "Submit proof"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskTable({
  title,
  tasks,
  emptyText,
  action,
  note,
}: {
  title: string;
  tasks: TaskRow[];
  emptyText: string;
  action?: (t: TaskRow) => React.ReactNode;
  note?: (t: TaskRow) => string | null;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Campaign</th>
              <th className="px-4 py-3 font-semibold">Store</th>
              <th className="px-4 py-3 font-semibold">Due</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              {(action || note) && <th className="px-4 py-3 text-right font-semibold">&nbsp;</th>}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{t.campaignName}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.storeName}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(t.dueDate)}</td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[t.status])}>
                    {t.status.replace("_", " ")}
                  </span>
                  {note?.(t) && <span className="ml-2 text-xs text-danger">{note(t)}</span>}
                </td>
                {(action || note) && (
                  <td className="px-4 py-3 text-right">{action?.(t)}</td>
                )}
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
