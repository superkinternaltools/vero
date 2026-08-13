import { requireAccess } from "@/core/auth/access";
import { listContests } from "@/modules/brand-visibility/queries";
import { listDepartments, listCampaignStatuses } from "@/modules/org/queries";
import { ContestsClient } from "@/modules/brand-visibility/components/contests-client";

export default async function BrandVisibilityPage() {
  await requireAccess("brand_visibility");
  const [contests, departments, statuses] = await Promise.all([
    listContests(),
    listDepartments(),
    listCampaignStatuses(),
  ]);

  return <ContestsClient contests={contests} departments={departments} statuses={statuses} />;
}
