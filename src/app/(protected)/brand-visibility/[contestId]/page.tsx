import { notFound } from "next/navigation";
import { requireAccess } from "@/core/auth/access";
import { getContest, listMonths, listUnlabelledCampaigns } from "@/modules/brand-visibility/queries";
import { ContestClient } from "@/modules/brand-visibility/components/contest-client";

export default async function ContestPage({ params }: { params: Promise<{ contestId: string }> }) {
  await requireAccess("brand_visibility");
  const { contestId } = await params;

  const contest = await getContest(contestId);
  if (!contest) notFound();

  const [months, unlabelledCampaigns] = await Promise.all([
    listMonths(contestId),
    listUnlabelledCampaigns(),
  ]);

  return (
    <ContestClient
      contestId={contest.id}
      contestName={contest.name}
      departmentName={contest.departmentName}
      months={months}
      unlabelledCampaigns={unlabelledCampaigns}
    />
  );
}
