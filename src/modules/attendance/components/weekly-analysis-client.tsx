"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import type { WeeklyRow } from "../types";

function fmtMins(m: number): string {
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function WeeklyAnalysisClient({
  rows,
  days,
  weekStart,
}: {
  rows: WeeklyRow[];
  days: string[];
  weekStart: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const go = (w: string) => router.push(`/attendance/analysis?week=${w}`);
  const label = `${new Date(days[0] + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(days[6] + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;

  const visible = q.trim() ? rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase())) : rows;
  const maxDay = Math.max(60, ...rows.flatMap((r) => r.perDayMinutes));

  function exportCsv() {
    const head = ["Person", "Present", "Expected", "Late", "Absent", "Worked (min)", "Overtime (min)", "Avg in", "Avg out"];
    const lines = visible.map((r) =>
      [r.name, r.present, r.expected, r.late, r.absent, r.workedMinutes, r.overtimeMinutes, r.avgIn ?? "", r.avgOut ?? ""]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-week-${weekStart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Weekly analysis</h1>
          <p className="mt-1 text-sm text-muted-foreground">Working hours, overtime, and attendance per person.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-border bg-input px-2 py-1.5">
            <button onClick={() => go(addDaysISO(weekStart, -7))} aria-label="Previous week" className="rounded p-1 hover:bg-muted">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[130px] text-center text-sm font-medium text-foreground">{label}</span>
            <button onClick={() => go(addDaysISO(weekStart, 7))} aria-label="Next week" className="rounded p-1 hover:bg-muted">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter people…"
              className="rounded-xl border border-transparent bg-input py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none"
            />
          </div>
          {visible.length > 0 && (
            <Button variant="outline" size="md" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Person</th>
              <th className="px-4 py-3 font-semibold">Present</th>
              <th className="px-4 py-3 font-semibold">Late</th>
              <th className="px-4 py-3 font-semibold">Absent</th>
              <th className="px-4 py-3 font-semibold">Worked</th>
              <th className="px-4 py-3 font-semibold">Overtime</th>
              <th className="px-4 py-3 font-semibold">Avg in / out</th>
              <th className="px-4 py-3 font-semibold">Hours / day</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.userId} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium text-foreground">{r.name}</td>
                <td className="px-4 py-2.5 tabular-nums text-foreground">{r.present}/{r.expected}</td>
                <td className={cn("px-4 py-2.5 tabular-nums", r.late ? "text-warning" : "text-muted-foreground")}>{r.late}</td>
                <td className={cn("px-4 py-2.5 tabular-nums", r.absent ? "text-danger" : "text-muted-foreground")}>{r.absent}</td>
                <td className="px-4 py-2.5 tabular-nums font-medium text-foreground">{fmtMins(r.workedMinutes)}</td>
                <td className={cn("px-4 py-2.5 tabular-nums", r.overtimeMinutes ? "text-success" : "text-muted-foreground")}>
                  {r.overtimeMinutes ? `+${fmtMins(r.overtimeMinutes)}` : "—"}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                  {r.avgIn ?? "—"} / {r.avgOut ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-end gap-0.5" style={{ height: 24 }}>
                    {r.perDayMinutes.map((m, i) => (
                      <span
                        key={i}
                        title={`${days[i]}: ${fmtMins(m)}`}
                        className="w-2 rounded-sm bg-primary/60"
                        style={{ height: `${Math.max(2, Math.round((m / maxDay) * 24))}px` }}
                      />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">
                  No attendance data for this week.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
