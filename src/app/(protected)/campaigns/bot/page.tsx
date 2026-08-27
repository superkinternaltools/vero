import { requireAccess } from "@/core/auth/access";
import {
  listExecutionTypes,
  listDepartments,
  listJobTitles,
  listCampaignCategories,
  listBrands,
} from "@/modules/org/queries";
import { listStores } from "@/modules/stores/queries";
import { CampaignBotClient } from "@/modules/campaigns/components/campaign-bot-client";

export default async function CampaignBotPage() {
  await requireAccess("campaigns");
  const [executionTypes, departments, jobTitles, categories, brands, stores] = await Promise.all([
    listExecutionTypes(),
    listDepartments(),
    listJobTitles(),
    listCampaignCategories(),
    listBrands(),
    listStores(),
  ]);

  return (
    <CampaignBotClient
      executionTypes={executionTypes}
      departments={departments}
      jobTitles={jobTitles}
      categories={categories}
      brands={brands}
      stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
    />
  );
}
