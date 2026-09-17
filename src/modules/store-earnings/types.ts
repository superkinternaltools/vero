export type StoreOption = { id: string; name: string };

/** "unscored" = no submission, or a submission with neither a human nor an
 * AI verdict yet (task still pending/submitted/missed/not_done) — the only
 * state that doesn't count toward payout. An AI verdict with no human
 * review yet DOES count already (see resolveSubmission in queries.ts) —
 * humanReviewed just says whether a person has since confirmed it. */
export type SubmissionVerdict = "approved" | "rejected" | "unscored";

/** One submission's resolved payout outcome — a week almost always holds
 * exactly one of these, but a daily-frequency campaign can have several. */
export type SubmissionDetail = {
  dueDate: string;
  verdict: SubmissionVerdict;
  humanReviewed: boolean;
  tierLabel: string | null;
  pct: number | null;
  amount: number;
  aiScore: number | null;
  rejectionReason: string | null;
  photos: string[];
};

export type WeekDetail = {
  week: number;
  amount: number;
  submissions: SubmissionDetail[];
};

export type CampaignEarnings = {
  campaignId: string;
  name: string;
  payoutModel: string;
  payoutAmount: number;
  total: number;
  weeks: WeekDetail[];
};

export type StoreEarningsSummary = {
  storeId: string;
  storeName: string;
  month: string;
  total: number;
  lastMonthTotal: number;
  weekCount: number;
  weeklyTotals: number[];
  campaigns: CampaignEarnings[];
};
