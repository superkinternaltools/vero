import { requireAccess } from "@/core/auth/access";
import { listUsers, listShellUsers } from "@/modules/users/queries";
import { listRoles, listDepartments, listJobTitles } from "@/modules/org/queries";
import { listStores } from "@/modules/stores/queries";
import { UsersClient } from "@/modules/users/components/users-client";

export default async function UsersPage() {
  await requireAccess("users");
  const [users, shellUsers, roles, departments, jobTitles, stores] = await Promise.all([
    listUsers(),
    listShellUsers(),
    listRoles(),
    listDepartments(),
    listJobTitles(),
    listStores(),
  ]);

  const storeOpts = stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }));

  return (
    <UsersClient
      users={users}
      shellUsers={shellUsers}
      roles={roles}
      departments={departments}
      jobTitles={jobTitles}
      stores={storeOpts}
    />
  );
}
