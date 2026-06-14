import Link from "next/link";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";
import { requireAccess } from "@/core/auth/access";
import { listCampaigns } from "@/modules/campaigns/queries";
import { deleteCampaign, duplicateCampaign } from "@/modules/campaigns/actions";
import { Button } from "@/core/ui/button";
import { GenerateTasksButton } from "@/modules/campaigns/components/generate-tasks-button";
import { cn } from "@/core/lib/utils";
import type { CampaignStatus, Frequency } from "@/modules/campaigns/types";

const FREQ: Record<Frequency, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-success/10 text-success",
  paused: "bg-warning/10 text-warning",
  completed: "bg-info/10 text-info",
};
const statusStyle = (s: CampaignStatus) => STATUS_STYLES[s] ?? "bg-muted text-muted-foreground";

export default async function CampaignsPage() {
  await requireAccess("campaigns");
  const campaigns = await listCampaigns();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}.
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

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
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
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b border-border align-top last:border-0">
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
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">
                  No campaigns yet. Click “Add New Campaign” to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
