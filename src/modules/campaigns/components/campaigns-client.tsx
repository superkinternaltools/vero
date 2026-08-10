"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Trash2, Copy, X, Search } from "lucide-react";
import { Button } from "@/core/ui/button";
import { MultiSelect } from "@/core/ui/multi-select";
import { GenerateTasksButton } from "./generate-tasks-button";
import { cn } from "@/core/lib/utils";
import { duplicateCampaign, deleteCampaign, bulkSetCampaignStatus } from "../actions";
import type { CampaignListRow, CampaignStatus, Frequency } from "../types";

const FREQ: Record<Frequency, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const FREQUENCY_OPTIONS = Object.entries(FREQ).map(([id, label]) => ({ id, label }));
const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-success/10 text-success",
  paused: "bg-warning/10 text-warning",
  completed: "bg-info/10 text-info",
};
const statusStyle = (s: CampaignStatus) => STATUS_STYLES[s] ?? "bg-muted text-muted-foreground";

export function CampaignsClient({
  campaigns,
  statuses,
}: {
  campaigns: CampaignListRow[];
  statuses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterDepts, setFilterDepts] = useState<string[]>([]);
  const [filterExecTypes, setFilterExecTypes] = useState<string[]>([]);
  const [filterFrequencies, setFilterFrequencies] = useState<string[]>([]);

  const deptOptions = useMemo(() => {
    const names = new Set<string>();
    for (const c of campaigns) c.departmentNames.forEach((d) => names.add(d));
    return [...names].sort().map((name) => ({ id: name, label: name }));
  }, [campaigns]);

  const execTypeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const c of campaigns) if (c.executionTypeName) names.add(c.executionTypeName);
    return [...names].sort().map((name) => ({ id: name, label: name }));
  }, [campaigns]);

  const isFiltered =
    search.trim().length > 0 ||
    filterStatuses.length > 0 ||
    filterDepts.length > 0 ||
    filterExecTypes.length > 0 ||
    filterFrequencies.length > 0;

  const visibleCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (filterStatuses.length && !filterStatuses.includes(c.status)) return false;
      if (filterFrequencies.length && !filterFrequencies.includes(c.frequency)) return false;
      if (filterExecTypes.length && (!c.executionTypeName || !filterExecTypes.includes(c.executionTypeName))) return false;
      if (filterDepts.length && !c.departmentNames.some((d) => filterDepts.includes(d))) return false;
      return true;
    });
  }, [campaigns, search, filterStatuses, filterFrequencies, filterExecTypes, filterDepts]);

  function clearFilters() {
    setSearch("");
    setFilterStatuses([]);
    setFilterDepts([]);
    setFilterExecTypes([]);
    setFilterFrequencies([]);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allSelected = visibleCampaigns.length > 0 && visibleCampaigns.every((c) => selectedIds.has(c.id));
    setSelectedIds(allSelected ? new Set() : new Set(visibleCampaigns.map((c) => c.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkStatus("");
    setBulkError(null);
  }

  function applyBulkStatus() {
    if (!bulkStatus) return;
    setBulkError(null);
    start(async () => {
      const res = await bulkSetCampaignStatus(Array.from(selectedIds), bulkStatus);
      if (res.failed) setBulkError(`${res.failed} of ${res.updated} had trouble updating tasks — status was still changed.`);
      clearSelection();
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {visibleCampaigns.length}
            {isFiltered ? ` of ${campaigns.length}` : ""} campaign{campaigns.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex gap-2">
          <GenerateTasksButton />
          <Link href="/campaigns/new">
            <Button size="md">
              <Plus className="h-4 w-4" />
              Add New Campaign
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="relative">
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Search</label>
          <Search className="absolute left-3 top-[calc(50%+8px)] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Campaign name…"
            className="h-11 w-full rounded-xl border border-transparent bg-input py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Status</label>
          <MultiSelect
            options={statuses.map((s) => ({ id: s.name, label: s.name }))}
            selected={filterStatuses}
            onChange={setFilterStatuses}
            placeholder="All statuses"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Department</label>
          <MultiSelect
            options={deptOptions}
            selected={filterDepts}
            onChange={setFilterDepts}
            placeholder="All departments"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Execution type</label>
          <MultiSelect
            options={execTypeOptions}
            selected={filterExecTypes}
            onChange={setFilterExecTypes}
            placeholder="All execution types"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Frequency</label>
          <MultiSelect
            options={FREQUENCY_OPTIONS}
            selected={filterFrequencies}
            onChange={setFilterFrequencies}
            placeholder="All frequencies"
          />
        </div>
        {isFiltered && (
          <div className="flex items-end xl:col-span-5">
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-muted-foreground underline hover:text-foreground"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={visibleCampaigns.length > 0 && visibleCampaigns.every((c) => selectedIds.has(c.id))}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 cursor-pointer rounded accent-primary"
                />
              </th>
              <th className="px-4 py-3 font-semibold">Campaign</th>
              <th className="px-4 py-3 font-semibold">Execution</th>
              <th className="px-4 py-3 font-semibold">Frequency</th>
              <th className="px-4 py-3 font-semibold">Departments</th>
              <th className="px-4 py-3 font-semibold"># Stores</th>
              <th className="px-4 py-3 font-semibold">Payout</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleCampaigns.map((c) => (
              <tr key={c.id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="h-4 w-4 cursor-pointer rounded accent-primary"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.executionTypeName ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{FREQ[c.frequency]}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.departmentNames.join(", ") || "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.storeCount}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.payout_enabled ? `₹${c.payout_amount}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                      statusStyle(c.status),
                    )}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/campaigns/${c.id}/edit`}
                      aria-label="Edit"
                      className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <form action={duplicateCampaign}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        aria-label="Duplicate"
                        title="Duplicate campaign"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </form>
                    <form action={deleteCampaign}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        aria-label="Delete"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {visibleCampaigns.length === 0 && (
              <tr>
                <td colSpan={9} className="p-10 text-center text-sm text-muted-foreground">
                  {isFiltered
                    ? "No campaigns match these filters."
                    : "No campaigns yet. Click “Add New Campaign” to create one."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Floating bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-lg md:left-64">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} selected
            </span>

            <div className="flex items-center gap-1.5">
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="h-10 rounded-xl border border-border bg-input px-3 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Set status…</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
              {bulkStatus && (
                <Button size="md" onClick={applyBulkStatus} disabled={pending}>
                  Apply
                </Button>
              )}
            </div>

            {bulkError && <p className="text-sm font-medium text-danger">{bulkError}</p>}

            <button
              onClick={clearSelection}
              aria-label="Clear selection"
              className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
