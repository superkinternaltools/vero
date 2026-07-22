import { requireAccess } from "@/core/auth/access";
import { listStoreOptions } from "@/modules/contest-impact/queries";
import { ContestImpactTabs } from "@/modules/contest-impact/components/contest-impact-tabs";
import { HistoricalClient } from "@/modules/contest-impact/components/historical-client";

export default async function ContestImpactHistoricalPage() {
  await requireAccess("contest_impact");
  const stores = await listStoreOptions();

  return (
    <div>
      <ContestImpactTabs />
      <HistoricalClient stores={stores} />
    </div>
  );
}
