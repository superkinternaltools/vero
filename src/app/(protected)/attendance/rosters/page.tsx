import { requireAccess } from "@/core/auth/access";
import {
  listRosters,
  listPresets,
  listAssignableUsers,
  listAllStores,
  getRosterGrid,
} from "@/modules/attendance/queries";
import { RostersClient } from "@/modules/attendance/components/rosters-client";

export default async function RostersPage({
  searchParams,
}: {
  searchParams: Promise<{ roster?: string; week?: string }>;
}) {
  const access = await requireAccess("attendance");
  const scope = { userId: access.profile.id, isAdmin: access.isAdmin };
  const { roster, week } = await searchParams;
  const [rosters, presets, users, stores] = await Promise.all([
    listRosters(scope),
    listPresets(),
    listAssignableUsers(),
    listAllStores(),
  ]);
  const grid = roster ? await getRosterGrid(roster, week, scope) : null;

  return (
    <RostersClient
      rosters={rosters}
      presets={presets}
      users={users}
      stores={stores}
      grid={grid}
      selectedRosterId={roster ?? null}
    />
  );
}
