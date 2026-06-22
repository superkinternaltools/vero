export type TaskStatus =
  | "pending"
  | "submitted"
  | "approved"
  | "rejected"
  | "missed"
  | "not_done";

export type TaskRow = {
  id: string;
  campaignId: string;
  storeId: string;
  campaignName: string;
  executionTypeName: string | null;
  storeName: string;
  dueDate: string;
  cycleStart: string;
  cycleEnd: string;
  frequency: string;
  status: TaskStatus;
  instructions: string | null;
  referenceImages: string[];
  captureMode: "camera" | "gallery";
  numPhotos: number;
  rejectionReason: string | null;
  nonSubmissionReason: string | null;
  submittedPhotos: string[];
  windowStart: string | null;
  windowEnd: string | null;
};
