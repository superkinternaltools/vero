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
  /** FOFO-only contact for reaching the Store Partner directly (e.g. over
   * WhatsApp) — independent of and in addition to any Vero login they may
   * also have via the Users/job-title flow. */
  partner_name: string | null;
  partner_email: string | null;
  partner_phone: string | null;
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
  /** Optional so CSV bulk-upload rows can omit them entirely — upsert then
   * leaves any existing partner contact (set via the edit form) untouched
   * instead of nulling it out on every routine re-upload. */
  partner_name?: string | null;
  partner_email?: string | null;
  partner_phone?: string | null;
};
