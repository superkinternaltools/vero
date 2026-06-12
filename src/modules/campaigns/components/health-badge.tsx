import { cn } from "@/core/lib/utils";
import type { Health } from "../stats";

const META: Record<Health, { label: string; cls: string }> = {
  on_track: { label: "On Track", cls: "bg-success/10 text-success" },
  needs_attention: { label: "Needs Attention", cls: "bg-warning/10 text-warning" },
  critical: { label: "Critical", cls: "bg-danger/10 text-danger" },
  no_data: { label: "No data", cls: "bg-muted text-muted-foreground" },
};

export function HealthBadge({ health }: { health: Health }) {
  const m = META[health];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", m.cls)}>
      {m.label}
    </span>
  );
}
