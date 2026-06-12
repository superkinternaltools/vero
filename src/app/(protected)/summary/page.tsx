import { requireAccess } from "@/core/auth/access";
import { listCampaignOptions, getCampaignMatrix } from "@/modules/summary/queries";
import { listRejectionReasons } from "@/modules/review/queries";
import { SummaryClient } from "@/modules/summary/components/summary-client";

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  await requireAccess("summary");
  const { campaign } = await searchParams;
  const [campaigns, rejectionReasons] = await Promise.all([
    listCampaignOptions(),
    listRejectionReasons(),
  ]);
  const matrix = campaign ? await getCampaignMatrix(campaign) : null;

  return (
    <SummaryClient
      campaigns={campaigns}
      selectedId={campaign ?? null}
      matrix={matrix}
      rejectionReasons={rejectionReasons}
    />
  );
}
