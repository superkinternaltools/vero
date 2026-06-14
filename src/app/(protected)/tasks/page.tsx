import { requireAccess } from "@/core/auth/access";
import { getCurrentProfile } from "@/core/auth/session";
import { getMyTasks } from "@/modules/tasks/queries";
import { listNonSubmissionReasons } from "@/modules/org/queries";
import { TasksClient } from "@/modules/tasks/components/tasks-client";

export default async function TasksPage() {
  await requireAccess("tasks");
  const [tasks, nonSubmissionReasons, profile] = await Promise.all([
    getMyTasks(),
    listNonSubmissionReasons(),
    getCurrentProfile(),
  ]);
  return (
    <TasksClient
      tasks={tasks}
      nonSubmissionReasons={nonSubmissionReasons}
      isAdmin={!!profile?.is_admin}
    />
  );
}
