import { requireAccess } from "@/core/auth/access";
import { getMyTasks } from "@/modules/tasks/queries";
import { listNonSubmissionReasons } from "@/modules/org/queries";
import { TasksClient } from "@/modules/tasks/components/tasks-client";

export default async function TasksPage() {
  await requireAccess("tasks");
  const [tasks, nonSubmissionReasons] = await Promise.all([
    getMyTasks(),
    listNonSubmissionReasons(),
  ]);
  return <TasksClient tasks={tasks} nonSubmissionReasons={nonSubmissionReasons} />;
}
