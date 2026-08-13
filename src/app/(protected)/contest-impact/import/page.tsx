import { requireAccess } from "@/core/auth/access";
import { listStoreOptions, listContestNameOptions } from "@/modules/contest-impact/queries";
import { getSheetConfig } from "@/modules/contest-impact/sync";
import { ContestImpactTabs } from "@/modules/contest-impact/components/contest-impact-tabs";
import { ImportClient } from "@/modules/contest-impact/components/import-client";

export default async function ContestImpactImportPage() {
  await requireAccess("contest_impact");
  const [stores, contests, sheetConfig] = await Promise.all([
    listStoreOptions(),
    listContestNameOptions(),
    getSheetConfig(),
  ]);

  return (
    <div>
      <ContestImpactTabs />
      <ImportClient stores={stores} contests={contests} sheetConfig={sheetConfig} />
    </div>
  );
}
