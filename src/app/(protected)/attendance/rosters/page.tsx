import { requireAccess } from "@/core/auth/access";
import {
  listRosters,
  listPresets,
  listAssignableUsers,
  getRosterGrid,
} from "@/modules/attendance/queries";
import { RostersClient } from "@/modules/attendance/components/rosters-client";

export default async function RostersPage({
  searchParams,
}: {
  searchParams: Promise<{ roster?: string; week?: string }>;
}) {
  await requireAccess("attendance");
  const { roster, week } = await searchParams;
  const [rosters, presets, users] = await Promise.all([
    listRosters(),
    listPresets(),
    listAssignableUsers(),
  ]);
  const grid = roster ? await getRosterGrid(roster, week) : null;

  return (
    <RostersClient
      rosters={rosters}
      presets={presets}
      users={users}
      grid={grid}
      selectedRosterId={roster ?? null}
    />
  );
}
