export type CampaignOption = {
  id: string;
  name: string;
  status: string;
  departmentIds: string[];
};

export type DepartmentOption = { id: string; name: string };

/** One photo destined for the zip: which store folder it lands in, and what
 * the file is called. One entry per photo, so a submission asking for two
 * photos produces two of these. */
export type PhotoExportItem = {
  storeName: string;
  campaignName: string;
  /** "YYYY-MM" — in the filename so a W2 from July can't collide with a W2 from August. */
  month: string;
  week: number;
  /** "approved" / "rejected" / the recorded tier label — goes in the filename. */
  verdict: string;
  url: string;
  /** 1-based, only used to disambiguate when a submission has several photos. */
  photoIndex: number;
  photoCount: number;
};

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

/** One row per task — who sent its photo, and what it pays under normal
 * rules. Backs the "Payout split by who submitted" section, which divides
 * that payout between the store and the SAE/ASM who sent it. The split
 * itself (share %, how Store Managers count) is applied in the browser so
 * it can be adjusted without reloading. */
export type SubmitterPayoutRow = {
  taskId: string;
  campaignId: string;
  campaignName: string;
  storeCode: string;
  storeName: string;
  week: number;
  submitterId: string | null;
  submitterName: string | null;
  /** Job title name of whoever sent the photo; null if nobody has yet, or they have no title. */
  submitterTitle: string | null;
  /** "none" = no submission for this task yet. */
  verdict: "approved" | "rejected" | "pending" | "none";
  tierLabel: string | null;
  /** Payout under the normal rules (tier-aware); 0 if payout isn't enabled. */
  fullPayout: number;
  /** The campaign's payout amount for this task — both the potential and the
   * base an SAE/ASM share is taken from; 0 if payout isn't enabled. */
  baseAmount: number;
};
