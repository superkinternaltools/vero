export type StoreType = "FOFO" | "COCO";

export type Store = {
  id: string;
  code: string;
  name: string;
  aligned: boolean;
  store_type: StoreType | null;
  latitude: number | null;
  longitude: number | null;
  score: number | null;
  /** No closed_at means the store is still active. No opened_at means it's
   * always existed. Both are informational unless something (like Contest
   * Impact's control group) needs to know whether a store was active on a
   * given date. */
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
};

export type StoreInput = {
  code: string;
  name: string;
  aligned: boolean;
  store_type: StoreType | null;
  latitude: number | null;
  longitude: number | null;
  opened_at: string | null;
  closed_at: string | null;
};
