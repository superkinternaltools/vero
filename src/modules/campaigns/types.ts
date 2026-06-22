export type Frequency = "daily" | "weekly" | "monthly";
export type PayoutTier = { label: string; min_score: number; max_score: number; pct: number };
/** Configurable in Settings (seeded: draft, active, paused, completed). */
export type CampaignStatus = string;
export type ScoreMode = "reviewer_preferred" | "ai_preferred" | "ai_auto_approve";
export type AIStrictness = "low" | "medium" | "high";
export type CaptureMode = "camera" | "gallery";

export type CampaignFormValues = {
  name: string;
  execution_type_id: string | null;
  frequency: Frequency;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  instructions: string;
  reference_images: string[];
  departmentIds: string[];
  storeIds: string[];
  jobTitleIds: string[];
  payout_enabled: boolean;
  payout_amount: number;
  payout_model: string;
  payout_tiers: PayoutTier[];
  ai_review: boolean;
  ai_strictness: AIStrictness;
  pass_threshold: number;
  score_mode: ScoreMode;
  ai_score_visible: boolean;
  scoring_rubric: string;
  capture_mode: CaptureMode;
  num_photos: number;
  allow_late: boolean;
  skip_weekends: boolean;
  skip_holidays: boolean;
  skip_dates: string[];
  submission_window_start: string | null;
  submission_window_end: string | null;
};

export type CampaignListRow = {
  id: string;
  name: string;
  frequency: Frequency;
  status: CampaignStatus;
  payout_enabled: boolean;
  payout_amount: number;
  executionTypeName: string | null;
  departmentNames: string[];
  storeCount: number;
};

export const EMPTY_CAMPAIGN: CampaignFormValues = {
  name: "",
  execution_type_id: null,
  frequency: "weekly",
  status: "draft",
  start_date: null,
  end_date: null,
  instructions: "",
  reference_images: [],
  departmentIds: [],
  storeIds: [],
  jobTitleIds: [],
  payout_enabled: false,
  payout_amount: 0,
  payout_model: "binary",
  payout_tiers: [],
  ai_review: true,
  ai_strictness: "medium",
  pass_threshold: 7,
  score_mode: "reviewer_preferred",
  ai_score_visible: true,
  scoring_rubric: "",
  capture_mode: "camera",
  num_photos: 1,
  allow_late: false,
  skip_weekends: false,
  skip_holidays: false,
  skip_dates: [],
  submission_window_start: null,
  submission_window_end: null,
};
