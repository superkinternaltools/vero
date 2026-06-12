"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/core/ui/button";
import { generateTasks } from "@/modules/tasks/actions";

export function GenerateTasksButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const res = await generateTasks();
      if (res.error) window.alert(res.error);
      else window.alert(`Generated/ensured ${res.count} task(s) for active campaigns.`);
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="md" onClick={run} disabled={pending}>
      <RefreshCw className="h-4 w-4" />
      {pending ? "Generating…" : "Generate tasks"}
    </Button>
  );
}
