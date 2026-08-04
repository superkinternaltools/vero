export type CampaignOption = {
  id: string;
  name: string;
  status: string;
  departmentIds: string[];
};

export type DepartmentOption = { id: string; name: string };

/** One row per campaign × store × week (day-of-month chunk). Backs both the
 * "Overall payouts" and "Submission status" exports — same grouping, just a
 * different column selection. */
export type ExportGroupRow = {
  campaignId: string;
  campaignName: string;
  storeCode: string;
  storeName: string;
  month: string; // "YYYY-MM"
  week: number; // 1-5
  assignedCount: number;
  approvedCount: number;
  statusSummary: string;
  /** What this store could earn this campaign this week if every assigned
   * task were approved at the full rate — 0 whenever payout isn't enabled. */
  expectedPayout: number;
  /** What was actually earned, based on real approvals (tiered-aware). */
  actualPayout: number;
  /** "binary" or "tiered" — this campaign's actual configured model. If
   * binary, "Approved"/"Rejected"/"Pending" IS the correct output, not a bug. */
  payoutModel: string;
  /** Raw diagnostic fields — only populated for single-task weeks (one row
   * per store per week is the common case). Lets us see exactly why a row
   * resolved the way it did instead of guessing. Null for multi-task weeks. */
  taskStatus: string | null;
  hasSubmission: boolean | null;
  reviewerScore: number | null;
  aiScore: number | null;
  recordedTierLabel: string | null;
};
