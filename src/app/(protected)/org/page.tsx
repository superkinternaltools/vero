import { requireAccess } from "@/core/auth/access";
import {
  listRoles,
  listDepartments,
  listJobTitles,
  listExecutionTypes,
} from "@/modules/org/queries";
import { OrgClient } from "@/modules/org/components/org-client";

export default async function OrgPage() {
  await requireAccess("org");
  const [roles, departments, jobTitles, executionTypes] = await Promise.all([
    listRoles(),
    listDepartments(),
    listJobTitles(),
    listExecutionTypes(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Roles &amp; Departments
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage the lists used across Vero.
      </p>
      <div className="mt-6">
        <OrgClient
          roles={roles.map((r) => ({ id: r.id, name: r.name }))}
          departments={departments}
          jobTitles={jobTitles}
          executionTypes={executionTypes}
        />
      </div>
    </div>
  );
}
