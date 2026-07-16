"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, MapPin } from "lucide-react";
import { Button } from "@/core/ui/button";
import { Modal } from "@/core/ui/modal";
import { cn } from "@/core/lib/utils";
import { markPunchReviewed, resetReference } from "../actions";
import { AttendanceTabs } from "./attendance-tabs";
import type { AttendanceLog, LogRow, DayStatus } from "../types";

const STATUS: Record<DayStatus, { label: string; cls: string }> = {
  present: { label: "Present", cls: "bg-success/10 text-success" },
  overtime: { label: "Overtime", cls: "bg-success/10 text-success" },
  late: { label: "Late arrival", cls: "bg-warning/10 text-warning" },
  absent: { label: "Absent", cls: "bg-danger/10 text-danger" },
  left_early: { label: "Left early", cls: "bg-danger/10 text-danger" },
  incomplete: { label: "Incomplete", cls: "bg-muted text-muted-foreground" },
  off: { label: "Off", cls: "bg-muted text-muted-foreground" },
};

function fmtMins(m: number | null): string {
  if (m == null) return "—";
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function AttendanceLogClient({
  log,
  date,
  today,
}: {
  log: AttendanceLog;
  date: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [detail, setDetail] = useState<LogRow | null>(null);

  const go = (d: string) => router.push(`/attendance?date=${d}`);
  const dateLabel = new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });

  function exportCsv() {
    const head = ["Person", "Store", "Shift", "Check-in", "Check-out", "Worked", "Overtime (min)", "Status", "Flags"];
    const lines = log.rows.map((r) =>
      [r.name, r.storeName, r.shiftLabel, r.checkIn ?? "", r.checkOut ?? "", fmtMins(r.workedMinutes), r.overtimeMinutes, STATUS[r.status].label, r.flags.join("|")]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tiles = [
    { n: log.summary.expected, l: "Expected", cls: "text-foreground" },
    { n: log.summary.present, l: "Present", cls: "text-success" },
    { n: log.summary.late, l: "Late arrival", cls: "text-warning" },
    { n: log.summary.absent, l: "Absent", cls: "text-danger" },
    { n: log.summary.flagged, l: "Flagged", cls: "text-danger" },
  ];

  return (
    <div>
      <AttendanceTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">Photo-verified punches per person, per day.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-border bg-input px-2 py-1.5">
            <button onClick={() => go(addDaysISO(date, -1))} aria-label="Previous day" className="rounded p-1 hover:bg-muted">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[130px] text-center text-sm font-medium text-foreground">{dateLabel}</span>
            <button
              onClick={() => go(addDaysISO(date, 1))}
              disabled={date >= today}
              aria-label="Next day"
              className="rounded p-1 hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {date !== today && (
            <Button variant="outline" size="md" onClick={() => go(today)}>Today</Button>
          )}
          {log.rows.length > 0 && (
            <Button variant="outline" size="md" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.l} className="rounded-2xl border border-border bg-card p-4">
            <p className={cn("text-2xl font-bold tabular-nums", t.cls)}>{t.n}</p>
            <p className="text-xs text-muted-foreground">{t.l}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Person</th>
              <th className="px-4 py-3 font-semibold">Store</th>
              <th className="px-4 py-3 font-semibold">Shift</th>
              <th className="px-4 py-3 font-semibold">In</th>
              <th className="px-4 py-3 font-semibold">Out</th>
              <th className="px-4 py-3 font-semibold">Worked</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Flags</th>
            </tr>
          </thead>
          <tbody>
            {log.rows.map((r) => (
              <tr
                key={r.userId}
                onClick={() => setDetail(r)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-2.5 font-medium text-foreground">{r.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.storeName}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.shiftLabel}</td>
                <td className={cn("px-4 py-2.5 tabular-nums", r.status === "late" ? "text-warning" : "text-foreground")}>{r.checkIn ?? "—"}</td>
                <td className="px-4 py-2.5 tabular-nums text-foreground">{r.checkOut ?? "—"}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                  {fmtMins(r.workedMinutes)}
                  {r.overtimeMinutes > 0 && <span className="ml-1 text-success">+{fmtMins(r.overtimeMinutes)}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS[r.status].cls)}>
                    {STATUS[r.status].label}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {r.flags.includes("geo") && (
                    <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                      <MapPin className="h-3 w-3" /> geo
                    </span>
                  )}
                  {r.flags.includes("no_gps") && (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">no gps</span>
                  )}
                </td>
              </tr>
            ))}
            {log.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">
                  No one was rostered on this day.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.name} · ${dateLabel}` : ""}>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="text-center">
                <div className="h-28 w-28 overflow-hidden rounded-xl border border-border bg-muted">
                  {detail.referencePhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detail.referencePhoto} alt="reference" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No reference</div>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Reference</p>
              </div>
              {detail.punches.map((p) => (
                <div key={p.id} className="text-center">
                  <div className="h-28 w-28 overflow-hidden rounded-xl border border-border bg-muted">
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photoUrl} alt={p.kind} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Unavailable</div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.kind.replace("_", " ")} ·{" "}
                    {new Date(p.capturedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {p.geofenceFlag && (
                    <p className="text-xs font-medium text-danger">{p.geofenceDistanceM} m away</p>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              Compare the punch photo(s) to the reference by eye. Automated face-matching arrives in Phase 2.
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {detail.punches.some((p) => !p.reviewedAt) && detail.punches[0] && (
                <Button
                  variant="outline"
                  size="md"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      for (const p of detail.punches) await markPunchReviewed(p.id);
                      setDetail(null);
                      router.refresh();
                    })
                  }
                >
                  Mark reviewed
                </Button>
              )}
              <Button
                variant="outline"
                size="md"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Reset ${detail.name}'s reference photo? Their next punch becomes the new reference.`)) return;
                  start(async () => {
                    await resetReference(detail.userId);
                    setDetail(null);
                    router.refresh();
                  });
                }}
              >
                Reset reference
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
