"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/core/lib/utils";
import { MultiSelect } from "@/core/ui/multi-select";
import type { CampaignHealthRow, Health } from "../stats";
import { HealthBadge } from "./health-badge";

const HEALTH_OPTS: { value: string; label: string }[] = [
  { value: "", label: "All health" },
  { value: "on_track", label: "On Track" },
  { value: "needs_attention", label: "Needs Attention" },
  { value: "critical", label: "Critical" },
  { value: "no_data", label: "No Data" },
];

const _now = new Date();
const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;

type Window = "week" | "month";

export function HealthTableClient({ rows }: { rows: CampaignHealthRow[] }) {
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<Health | "">("");
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [deptFilter, setDeptFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [window, setWindow] = useState<Window>("week");

  // Build department options from all rows
  const deptOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [{ value: "", label: "All departments" }];
    for (const r of rows) {
      for (const d of r.departmentNames) {
        if (!seen.has(d)) {
          seen.add(d);
          opts.push({ value: d, label: d });
        }
      }
    }
    return opts;
  }, [rows]);

  const campaignOptions = useMemo(
    () => rows.map((r) => ({ id: r.id, label: r.name })),
    [rows],
  );

  const submissionPct = (r: CampaignHealthRow) =>
    window === "week" ? r.submissionPctWeek : r.submissionPctMonth;
  const health = (r: CampaignHealthRow) =>
    window === "week" ? r.healthWeek : r.healthMonth;

  const filtered = rows.filter((r) => {
    if (campaignIds.length > 0 && !campaignIds.includes(r.id)) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (healthFilter && health(r) !== healthFilter) return false;
    if (deptFilter && !r.departmentNames.includes(deptFilter)) return false;
    if (activeOnly) {
      if (!r.startDate || !r.endDate) return false;
      if (r.startDate > today || r.endDate < today) return false;
    }
    return true;
  });

  const hasFilters = search || healthFilter || campaignIds.length > 0 || deptFilter || activeOnly;

  function clearAll() {
    setSearch("");
    setHealthFilter("");
    setCampaignIds([]);
    setDeptFilter("");
    setActiveOnly(false);
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Campaign health</h2>

        <div className="flex flex-wrap items-center gap-2">
          {/* Week / Month toggle */}
          <div className="flex rounded-xl border border-border bg-input p-0.5 text-sm">
            {(["week", "month"] as Window[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                className={cn(
                  "rounded-lg px-3 py-1.5 font-medium capitalize transition-colors",
                  window === w
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {w === "week" ? "This Week" : "This Month"}
              </button>
            ))}
          </div>

          {/* Campaign multi-select */}
          <div className="w-56">
            <MultiSelect
              options={campaignOptions}
              selected={campaignIds}
              onChange={setCampaignIds}
              placeholder="All campaigns"
              dropUp
            />
          </div>

          {/* Department filter */}
          {deptOptions.length > 1 && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="rounded-xl border border-transparent bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
            >
              {deptOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}

          {/* Health filter */}
          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value as Health | "")}
            className="rounded-xl border border-transparent bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
          >
            {HEALTH_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Active now toggle */}
          <button
            type="button"
            onClick={() => setActiveOnly((v) => !v)}
            className={cn(
              "rounded-xl border px-3 py-2 text-sm transition-colors",
              activeOnly
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-transparent bg-input text-foreground hover:bg-muted",
            )}
          >
            Active now
          </button>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaign…"
              className="rounded-xl border border-transparent bg-input py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
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
                  {r.departmentNames.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.departmentNames.join(", ")}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.executionTypeName ?? "—"}</td>
                <td
                  className={cn(
                    "px-4 py-3",
                    health(r) === "no_data"
                      ? "text-muted-foreground"
                      : submissionPct(r) < 50
                        ? "text-danger"
                        : "text-muted-foreground",
                  )}
                >
                  {health(r) === "no_data" ? "—" : (
                    <>
                      {submissionPct(r)}%
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({window === "week" ? `${r.weekSubmitted}/${r.weekTotal}` : `${r.monthSubmitted}/${r.monthTotal}`})
                      </span>
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {health(r) === "no_data" ? "—" : `${r.nonRejectionPct}%`}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  ₹{r.payoutCommitted.toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/campaigns/${r.id}`}>
                    <HealthBadge health={health(r)} />
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
      <p className="mt-2 text-xs text-muted-foreground">
        Submission % is based on tasks due within the selected window. Click a row for the detailed view.
      </p>
    </section>
  );
}
