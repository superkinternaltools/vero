"use client";

import { useState, useTransition } from "react";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import { classifyStatuses } from "../actions";

export function StatusClassificationForm({
  campaignKey,
  campaignLabel,
  statuses,
}: {
  campaignKey: string;
  campaignLabel: string;
  statuses: string[];
}) {
  const [choices, setChoices] = useState<Record<string, boolean | null>>(() =>
    Object.fromEntries(statuses.map((s) => [s, null])),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const allChosen = statuses.every((s) => choices[s] !== null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await classifyStatuses(
        campaignKey,
        statuses.map((s) => ({ rawStatus: s, isApproved: choices[s]! })),
      );
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">Classify execution statuses</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        &quot;{campaignLabel}&quot; has status values this report hasn&apos;t seen before. Mark each one as approved
        execution or not — everything not marked approved counts as poor execution. This only needs doing once per
        campaign.
      </p>

      <div className="mt-5 space-y-2">
        {statuses.map((status) => (
          <div key={status} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
            <span className="rounded-lg bg-muted px-2 py-1 font-mono text-xs text-foreground">&quot;{status}&quot;</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setChoices((c) => ({ ...c, [status]: true }))}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  choices[status] === true
                    ? "border-success bg-success/10 text-success"
                    : "border-border text-muted-foreground hover:border-success/50",
                )}
              >
                Approved execution
              </button>
              <button
                type="button"
                onClick={() => setChoices((c) => ({ ...c, [status]: false }))}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  choices[status] === false
                    ? "border-danger bg-danger/10 text-danger"
                    : "border-border text-muted-foreground hover:border-danger/50",
                )}
              >
                Poor execution
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-5 flex justify-end">
        <Button disabled={!allChosen || isPending} onClick={handleSubmit}>
          Save classification &amp; build report
        </Button>
      </div>
    </div>
  );
}
