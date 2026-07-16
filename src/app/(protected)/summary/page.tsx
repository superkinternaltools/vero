import { requireAccess } from "@/core/auth/access";
import { listCampaignOptions, getCampaignMatrix } from "@/modules/summary/queries";
import { listRejectionReasons } from "@/modules/review/queries";
import { SummaryClient } from "@/modules/summary/components/summary-client";

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const access = await requireAccess("summary");
  const scope = { userId: access.profile.id, isAdmin: access.isAdmin };
  const { campaign } = await searchParams;
  const [campaigns, rejectionReasons] = await Promise.all([
    listCampaignOptions(scope),
    listRejectionReasons(),
  ]);
  const matrix = campaign ? await getCampaignMatrix(campaign, scope) : null;

  return (
    <SummaryClient
      campaigns={campaigns}
      selectedId={campaign ?? null}
      matrix={matrix}
      rejectionReasons={rejectionReasons}
      isAdmin={access.isAdmin}
    />
  );
}
