"use client";

import { ListManager } from "./list-manager";
import {
  createRole,
  renameRole,
  deleteRole,
  createDepartment,
  renameDepartment,
  deleteDepartment,
  createJobTitle,
  renameJobTitle,
  deleteJobTitle,
  createExecutionType,
  renameExecutionType,
  deleteExecutionType,
} from "../actions";

type Item = { id: string; name: string };

export function OrgClient({
  roles,
  departments,
  jobTitles,
  executionTypes,
}: {
  roles: Item[];
  departments: Item[];
  jobTitles: Item[];
  executionTypes: Item[];
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <ListManager
        title="Roles"
        items={roles}
        addPlaceholder="New role"
        onCreate={createRole}
        onRename={renameRole}
        onDelete={deleteRole}
      />
      <ListManager
        title="Departments"
        items={departments}
        addPlaceholder="New department"
        onCreate={createDepartment}
        onRename={renameDepartment}
        onDelete={deleteDepartment}
      />
      <ListManager
        title="Job Titles"
        items={jobTitles}
        addPlaceholder="New job title"
        onCreate={createJobTitle}
        onRename={renameJobTitle}
        onDelete={deleteJobTitle}
      />
      <ListManager
        title="Execution Types"
        items={executionTypes}
        addPlaceholder="New execution type"
        onCreate={createExecutionType}
        onRename={renameExecutionType}
        onDelete={deleteExecutionType}
      />
    </div>
  );
}
