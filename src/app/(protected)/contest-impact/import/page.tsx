import { requireAccess } from "@/core/auth/access";
import { listCampaignOptions, listStoreOptions } from "@/modules/contest-impact/queries";
import { ContestImpactTabs } from "@/modules/contest-impact/components/contest-impact-tabs";
import { ImportClient } from "@/modules/contest-impact/components/import-client";

export default async function ContestImpactImportPage() {
  await requireAccess("contest_impact");
  const [campaigns, stores] = await Promise.all([listCampaignOptions(), listStoreOptions()]);

  return (
    <div>
      <ContestImpactTabs />
      <ImportClient campaigns={campaigns} stores={stores} />
    </div>
  );
}
