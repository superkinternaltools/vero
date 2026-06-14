"use server";

import { getPersonBreakdown } from "./queries";
import type { PersonAnalysisRow } from "./queries";

export async function fetchPersonBreakdown(params: {
  campaignIds: string[];
  dateFrom: string;
  dateTo: string;
  jobTitleId: string;
}): Promise<PersonAnalysisRow[]> {
  return getPersonBreakdown(params);
}
