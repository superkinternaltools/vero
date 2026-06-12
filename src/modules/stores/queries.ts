import { createClient } from "@/core/db/server";
import type { Store } from "./types";

export async function listStores(): Promise<Store[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("id, code, name, aligned, store_type, latitude, longitude, score, created_at")
    .is("deleted_at", null)
    .order("code", { ascending: true });
  return (data as Store[]) ?? [];
}
