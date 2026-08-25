import type { Store } from "./types";

export function isStoreActive(s: Pick<Store, "opened_at" | "closed_at">, today: string): boolean {
  return (!s.opened_at || s.opened_at <= today) && (!s.closed_at || s.closed_at >= today);
}
