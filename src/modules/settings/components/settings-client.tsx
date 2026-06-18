"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/core/ui/input";
import { Button } from "@/core/ui/button";
import { ListManager } from "@/core/ui/list-manager";
import { PermissionsMatrix } from "./permissions-matrix";
import { PERMISSION_KEYS } from "@/core/auth/permissions";
import { saveSettings } from "../actions";
import type { RoleWithLanding } from "../queries";
import {
  createRejectionReason,
  renameRejectionReason,
  deleteRejectionReason,
  createNonSubmissionReason,
  renameNonSubmissionReason,
  deleteNonSubmissionReason,
  createCampaignStatus,
  renameCampaignStatus,
  deleteCampaignStatus,
  createExecutionType,
  renameExecutionType,
  deleteExecutionType,
} from "@/modules/org/actions";

type Item = { id: string; name: string };
const labelClass = "block text-sm font-medium text-foreground";

export function SettingsClient({
  settings,
  rejectionReasons,
  nonSubmissionReasons,
  campaignStatuses,
  executionTypes,
  roles,
  granted,
}: {
  settings: Record<string, string>;
  rejectionReasons: Item[];
  nonSubmissionReasons: Item[];
  campaignStatuses: Item[];
  executionTypes: Item[];
  roles: RoleWithLanding[];
  granted: Record<string, string[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [onTrack, setOnTrack] = useState(settings.health_on_track ?? "80");
  const [needs, setNeeds] = useState(settings.health_needs_attention ?? "50");
  const [windowDays, setWindowDays] = useState(settings.store_score_window_days ?? "60");
  const [geofence, setGeofence] = useState(settings.geofence_radius_m ?? "150");
  const [sysInstruction, setSysInstruction] = useState(
    settings.ai_system_instruction ??
      "You are a retail execution auditor for SuperK. Score the provided store execution photos against the reference images, instructions, and rubric. Respond ONLY with JSON: {\"score\": <number 0-10>, \"assessment\": [<3-5 short bullet strings>]}.",
  );
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(false);
    start(async () => {
      await saveSettings({
        health_on_track: onTrack,
        health_needs_attention: needs,
        store_score_window_days: windowDays,
        geofence_radius_m: geofence,
        ai_system_instruction: sysInstruction,
      });
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Permissions, thresholds, and configurable lists.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Role permissions &amp; landing pages</h2>
        <div className="mt-3">
          <PermissionsMatrix
            roles={roles}
            permissions={PERMISSION_KEYS.map((p) => ({ key: p.key, label: p.label }))}
            granted={granted}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground">Thresholds</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className={labelClass}>On Track when Submission % ≥</label>
            <Input type="number" value={onTrack} onChange={(e) => setOnTrack(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Needs Attention when ≥</label>
            <Input type="number" value={needs} onChange={(e) => setNeeds(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Store score window (days)</label>
            <Input type="number" value={windowDays} onChange={(e) => setWindowDays(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Geofence radius (metres)</label>
            <Input type="number" value={geofence} onChange={(e) => setGeofence(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button size="md" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {saved && <span className="text-sm font-medium text-success">Saved.</span>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Health: at or above On-Track = On Track; between the two = Needs Attention; below = Critical.
          Photos taken further than the geofence radius from the store get flagged for the reviewer.
        </p>
        <div className="mt-4 space-y-1.5">
          <label className={labelClass}>AI system instruction</label>
          <textarea
            value={sysInstruction}
            onChange={(e) => setSysInstruction(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-transparent bg-input px-4 py-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
          />
          <p className="text-xs text-muted-foreground">
            This is the fixed system-level instruction given to the AI before every scoring run.
            The campaign rubric and instructions are added on top of this.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Configurable lists</h2>
        <div className="mt-3 grid gap-6 md:grid-cols-2">
          <ListManager
            title="Rejection reasons"
            items={rejectionReasons}
            addPlaceholder="New rejection reason"
            onCreate={createRejectionReason}
            onRename={renameRejectionReason}
            onDelete={deleteRejectionReason}
          />
          <ListManager
            title="Non-submission reasons"
            items={nonSubmissionReasons}
            addPlaceholder="New non-submission reason"
            onCreate={createNonSubmissionReason}
            onRename={renameNonSubmissionReason}
            onDelete={deleteNonSubmissionReason}
          />
          <ListManager
            title="Campaign statuses"
            items={campaignStatuses}
            addPlaceholder="New status"
            onCreate={createCampaignStatus}
            onRename={renameCampaignStatus}
            onDelete={deleteCampaignStatus}
          />
          <ListManager
            title="Execution types"
            items={executionTypes}
            addPlaceholder="e.g. Gondola End"
            onCreate={createExecutionType}
            onRename={renameExecutionType}
            onDelete={deleteExecutionType}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Built-in statuses (draft, active, paused, completed) drive app behaviour —
          tasks are generated only for campaigns with status <span className="font-medium">active</span> —
          so they can&apos;t be renamed or deleted, but you can add your own.
          Payout tiers (binary / tiered) are configured per campaign.
        </p>
      </section>
    </div>
  );
}
