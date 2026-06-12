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
  created_at: string;
};

export type StoreInput = {
  code: string;
  name: string;
  aligned: boolean;
  store_type: StoreType | null;
  latitude: number | null;
  longitude: number | null;
};
