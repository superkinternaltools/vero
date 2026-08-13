import type { PayoutTier } from "@/modules/campaigns/types";

export type SkuRequirementMode = "all" | "any_list" | "any_category";

export type SkuRow = {
  id: string;
  skuCode: string;
  skuName: string;
  /** Only meaningful for mode "all" — "any_list"/"any_category" share one
   * shelf value on the requirement itself. */
  shelf: string | null;
  qty: number | null;
};

export type SkuRequirement = {
  mode: SkuRequirementMode;
  /** "any_category" only. */
  category: string | null;
  /** "any_list" / "any_category" only — how many distinct products count. */
  minProducts: number | null;
  /** Shared shelf for "any_list" / "any_category". Mode "all" uses each
   * row's own shelf instead. */
  shelf: string | null;
  /** "any_list" = per product · "any_category" = total across the shelf. */
  qtyMode: "per_product" | "total" | null;
  qty: number | null;
};

export const EMPTY_REQUIREMENT: SkuRequirement = {
  mode: "all",
  category: null,
  minProducts: null,
  shelf: null,
  qtyMode: null,
  qty: null,
};

export type ContestListRow = {
  id: string;
  name: string;
  departmentName: string | null;
  monthCount: number;
  latestMonthName: string | null;
  latestMonthStatus: string | null;
};

export type MonthListRow = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  storeCount: number;
};

export type MonthFormValues = {
  name: string;
  executionTypeId: string | null;
  frequency: "daily" | "weekly" | "monthly";
  status: string;
  startDate: string | null;
  endDate: string | null;
  instructions: string;
  referenceImages: string[];
  departmentIds: string[];
  storeIds: string[];
  jobTitleIds: string[];
  payoutEnabled: boolean;
  payoutAmount: number;
  payoutModel: string;
  payoutTiers: PayoutTier[];
  aiReview: boolean;
  aiStrictness: "low" | "medium" | "high";
  passThreshold: number;
  scoreMode: string;
  aiScoreVisible: boolean;
  scoringRubric: string;
  captureMode: "camera" | "gallery";
  numPhotos: number;
  requirement: SkuRequirement;
  skus: SkuRow[];
};

export const EMPTY_MONTH: MonthFormValues = {
  name: "",
  executionTypeId: null,
  frequency: "weekly",
  status: "draft",
  startDate: null,
  endDate: null,
  instructions: "",
  referenceImages: [],
  departmentIds: [],
  storeIds: [],
  jobTitleIds: [],
  payoutEnabled: true,
  payoutAmount: 0,
  payoutModel: "binary",
  payoutTiers: [],
  aiReview: true,
  aiStrictness: "medium",
  passThreshold: 7,
  scoreMode: "reviewer_preferred",
  aiScoreVisible: true,
  scoringRubric: "",
  captureMode: "camera",
  numPhotos: 1,
  requirement: EMPTY_REQUIREMENT,
  skus: [],
};
