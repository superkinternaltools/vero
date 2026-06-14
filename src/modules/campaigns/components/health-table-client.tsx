"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/core/lib/utils";
import type { CampaignHealthRow, Health } from "../stats";
import { HealthBadge } from "./health-badge";

const HEALTH_OPTS: { value: string; label: string }[] = [
  { value: "", label: "All health" },
  { value: "on_track", label: "On Track" },
  { value: "needs_attention", label: "Needs Attention" },
  { value: "critical", label: "Critical" },
  { value: "no_data", label: "No Data" },
];

export function HealthTableClient({ rows }: { rows: CampaignHealthRow[] }) {
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<Health | "">("");

  const filtered = rows.filter((r) => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (healthFilter && r.health !== healthFilter) return false;
    return true;
  });

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Campaign health</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaign…"
              className="rounded-xl border border-transparent bg-input py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value as Health | "")}
            className="rounded-xl border border-transparent bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
          >
            {HEALTH_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {(search || healthFilter) && (
            <button
              type="button"
              onClick={() => { setSearch(""); setHealthFilter(""); }}
              className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Campaign</th>
              <th className="px-4 py-3 font-semibold">Execution</th>
              <th className="px-4 py-3 font-semibold">Submission %</th>
              <th className="px-4 py-3 font-semibold">Non-Rejection %</th>
              <th className="px-4 py-3 font-semibold">Payout (₹)</th>
              <th className="px-4 py-3 font-semibold">Health</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/campaigns/${r.id}`} className="text-foreground hover:text-primary">
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.executionTypeName ?? "—"}</td>
                <td className={cn("px-4 py-3", r.submissionPct < 50 ? "text-danger" : "text-muted-foreground")}>
                  {r.submissionPct}%
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.nonRejectionPct}%</td>
                <td className="px-4 py-3 text-muted-foreground">
                  ₹{r.payoutCommitted.toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/campaigns/${r.id}`}>
                    <HealthBadge health={r.health} />
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  {rows.length === 0 ? "No campaigns yet." : "No campaigns match the filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Click a campaign or its health badge for the deeper view.</p>
    </section>
  );
}
