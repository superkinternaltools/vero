import { requireAccess } from "@/core/auth/access";
import { listUsers } from "@/modules/users/queries";
import { listRoles, listDepartments, listJobTitles } from "@/modules/org/queries";
import { listStores } from "@/modules/stores/queries";
import { UsersClient } from "@/modules/users/components/users-client";

export default async function UsersPage() {
  await requireAccess("users");
  const [users, roles, departments, jobTitles, stores] = await Promise.all([
    listUsers(),
    listRoles(),
    listDepartments(),
    listJobTitles(),
    listStores(),
  ]);

  return (
    <UsersClient
      users={users}
      roles={roles}
      departments={departments}
      jobTitles={jobTitles}
      stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
    />
  );
}
