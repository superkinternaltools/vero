"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Tags, ArrowRight, X, Search } from "lucide-react";
import { Button } from "@/core/ui/button";
import { MultiSelect } from "@/core/ui/multi-select";
import { cn } from "@/core/lib/utils";
import { createContest } from "../actions";
import type { ContestListRow } from "../types";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-success/10 text-success",
  paused: "bg-warning/10 text-warning",
  completed: "bg-info/10 text-info",
};

function NewContestDialog({
  open,
  onClose,
  departments,
}: {
  open: boolean;
  onClose: () => void;
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function create() {
    setError(null);
    if (!name.trim()) {
      setError("Give it a name first.");
      return;
    }
    start(async () => {
      const res = await createContest(name, departmentId || null);
      if (res?.error) setError(res.error);
      else if (res?.id) router.push(`/brand-visibility/${res.id}/new`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-transparent px-7 pb-6 pt-8">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Tags className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground">New contest</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            A contest is the durable thing — like <span className="font-medium text-foreground">Tide</span>. It holds a
            chain of months underneath it, each with its own stores, requirement and payout.
          </p>
        </div>

        <div className="space-y-5 px-7 py-6">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tide, Ariel + Whisper"
              className="w-full rounded-2xl border border-transparent bg-input px-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Department <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full rounded-2xl border border-transparent bg-input px-4 py-3.5 text-sm text-foreground focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-7 py-5">
          <p className="text-xs text-muted-foreground">Next: set up its first month.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
            <Button size="md" onClick={create} disabled={pending}>
              {pending ? "Creating…" : "Continue"}
              {!pending && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContestsClient({
  contests,
  departments,
  statuses,
}: {
  contests: ContestListRow[];
  departments: { id: string; name: string }[];
  statuses: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterDeptNames, setFilterDeptNames] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);

  const isFiltered = search.trim().length > 0 || filterDeptNames.length > 0 || filterStatuses.length > 0;

  const visibleContests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contests.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (filterDeptNames.length && !(c.departmentName && filterDeptNames.includes(c.departmentName))) return false;
      if (filterStatuses.length && !(c.latestMonthStatus && filterStatuses.includes(c.latestMonthStatus))) return false;
      return true;
    });
  }, [contests, search, filterDeptNames, filterStatuses]);

  function clearFilters() {
    setSearch("");
    setFilterDeptNames([]);
    setFilterStatuses([]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Brand visibility</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {visibleContests.length}
            {isFiltered ? ` of ${contests.length}` : ""} contest{contests.length === 1 ? "" : "s"}.
          </p>
        </div>
        <Button size="md" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New contest
        </Button>
      </div>

      {contests.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-[28px] border border-dashed border-border bg-gradient-to-b from-muted/40 to-transparent px-8 py-16 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Tags className="h-6 w-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-foreground">Set up your first contest</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            A brand like Tide or Ariel becomes one contest here, with a fresh month set up each cycle —
            no more re-creating it from scratch every time.
          </p>
          <Button size="md" className="mt-6" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            New contest
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Search</label>
              <Search className="absolute left-3 top-[calc(50%+8px)] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Contest name…"
                className="h-11 w-full rounded-xl border border-transparent bg-input py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Department</label>
              <MultiSelect
                options={departments.map((d) => ({ id: d.name, label: d.name }))}
                selected={filterDeptNames}
                onChange={setFilterDeptNames}
                placeholder="All departments"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Latest month status</label>
              <MultiSelect
                options={statuses.map((s) => ({ id: s.name, label: s.name }))}
                selected={filterStatuses}
                onChange={setFilterStatuses}
                placeholder="All statuses"
              />
            </div>
            {isFiltered && (
              <div className="flex items-end">
                <button type="button" onClick={clearFilters} className="text-xs font-medium text-muted-foreground underline hover:text-foreground">
                  Clear filters
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Contest</th>
                  <th className="px-4 py-3 font-semibold">Department</th>
                  <th className="px-4 py-3 font-semibold">Months</th>
                  <th className="px-4 py-3 font-semibold">Latest month</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleContests.map((c) => (
                  <tr key={c.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Tags className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-medium text-foreground">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.departmentName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.monthCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.latestMonthName ?? "—"}</td>
                    <td className="px-4 py-3">
                      {c.latestMonthStatus ? (
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[c.latestMonthStatus] ?? "bg-muted text-muted-foreground")}>
                          {c.latestMonthStatus}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/brand-visibility/${c.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                        Open <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {visibleContests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                      No contests match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <NewContestDialog open={open} onClose={() => setOpen(false)} departments={departments} />
    </div>
  );
}
