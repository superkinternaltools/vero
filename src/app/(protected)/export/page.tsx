import { requireAdmin } from "@/core/auth/session";
import { listCampaignOptions, listDepartmentOptions, getExportGroups } from "@/modules/export/queries";
import { ExportClient } from "@/modules/export/components/export-client";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth();

  const [campaigns, departments, rows] = await Promise.all([
    listCampaignOptions(),
    listDepartmentOptions(),
    getExportGroups(month),
  ]);

  return <ExportClient month={month} campaigns={campaigns} departments={departments} rows={rows} />;
}
