"use server";

import { getAccess } from "@/core/auth/access";
import { getCampaignHealthRows } from "./stats";
import type { CampaignHealthRow } from "./stats";

export type { CampaignHealthRow };

export async function fetchHealthRows(opts: {
  weekStart: string;
  weekEnd: string;
  monthStart: string;
  monthEnd: string;
}): Promise<CampaignHealthRow[]> {
  const access = await getAccess();
  if (!access?.allowed.includes("dashboard")) return [];
  return getCampaignHealthRows(opts);
}
