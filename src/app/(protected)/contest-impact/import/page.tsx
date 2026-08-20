import { requireAccess } from "@/core/auth/access";
import { listStoreOptions, listVeroCampaigns } from "@/modules/contest-impact/queries";
import { ContestImpactTabs } from "@/modules/contest-impact/components/contest-impact-tabs";
import { ImportClient } from "@/modules/contest-impact/components/import-client";

export default async function ContestImpactImportPage() {
  await requireAccess("contest_impact");
  const [stores, veroCampaigns] = await Promise.all([listStoreOptions(), listVeroCampaigns()]);

  return (
    <div>
      <ContestImpactTabs />
      <ImportClient stores={stores} veroCampaigns={veroCampaigns} />
    </div>
  );
}
