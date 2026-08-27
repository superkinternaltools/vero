import { requireAccess } from "@/core/auth/access";
import { listCampaigns } from "@/modules/campaigns/queries";
import { listCampaignStatuses, listCampaignCategories, listBrands } from "@/modules/org/queries";
import { CampaignsClient } from "@/modules/campaigns/components/campaigns-client";

export default async function CampaignsPage() {
  await requireAccess("campaigns");
  const [campaigns, statuses, categories, brands] = await Promise.all([
    listCampaigns(),
    listCampaignStatuses(),
    listCampaignCategories(),
    listBrands(),
  ]);

  return <CampaignsClient campaigns={campaigns} statuses={statuses} categories={categories} brands={brands} />;
}
