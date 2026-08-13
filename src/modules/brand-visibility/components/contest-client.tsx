"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Link2 } from "lucide-react";
import { Button } from "@/core/ui/button";
import { MultiSelect } from "@/core/ui/multi-select";
import { Modal } from "@/core/ui/modal";
import { cn } from "@/core/lib/utils";
import { labelExistingCampaigns } from "../actions";
import type { MonthListRow } from "../types";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-success/10 text-success",
  paused: "bg-warning/10 text-warning",
  completed: "bg-info/10 text-info",
};

export function ContestClient({
  contestId,
  contestName,
  departmentName,
  months,
  unlabelledCampaigns,
}: {
  contestId: string;
  contestName: string;
  departmentName: string | null;
  months: MonthListRow[];
  unlabelledCampaigns: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [labelOpen, setLabelOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function applyLabel() {
    if (!picked.length) return;
    setError(null);
    start(async () => {
      const res = await labelExistingCampaigns(picked, contestId);
      if (res?.error) setError(res.error);
      else {
        setLabelOpen(false);
        setPicked([]);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">
        <Link href="/brand-visibility" className="hover:text-foreground">Brand visibility</Link>
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{contestName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{departmentName ?? "No department set"}</p>
        </div>
        <div className="flex gap-2">
          {unlabelledCampaigns.length > 0 && (
            <Button variant="outline" size="md" onClick={() => setLabelOpen(true)}>
              <Link2 className="h-4 w-4" />
              Add existing campaigns
            </Button>
          )}
          <Link href={`/brand-visibility/${contestId}/new`}>
            <Button size="md">
              <Plus className="h-4 w-4" />
              Start next month
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Month</th>
              <th className="px-4 py-3 font-semibold">Dates</th>
              <th className="px-4 py-3 font-semibold"># Stores</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{m.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {m.startDate ?? "—"} {m.endDate ? `– ${m.endDate}` : ""}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{m.storeCount}</td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[m.status] ?? "bg-muted text-muted-foreground")}>
                    {m.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/brand-visibility/${contestId}/${m.id}`} className="text-sm font-medium text-primary hover:underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {months.length === 0 && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">
                  No months yet. Click &quot;Start next month&quot; to set one up.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={labelOpen} onClose={() => setLabelOpen(false)} title="Add existing campaigns">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These campaigns aren&apos;t copied — they keep every task and submission exactly where it is, and stay
            visible in Campaigns, Summary, Export and Leaderboard too. This just groups them under {contestName}.
          </p>
          <MultiSelect
            options={unlabelledCampaigns.map((c) => ({ id: c.id, label: c.name }))}
            selected={picked}
            onChange={setPicked}
            placeholder="Select campaigns…"
          />
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="md" onClick={() => setLabelOpen(false)}>Cancel</Button>
            <Button size="md" onClick={applyLabel} disabled={pending || picked.length === 0}>
              {pending ? "Adding…" : `Add ${picked.length || ""}`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
