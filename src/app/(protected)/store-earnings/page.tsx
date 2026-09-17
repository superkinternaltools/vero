import { requireAccess } from "@/core/auth/access";
import { listStoresForUser, getStoreEarnings } from "@/modules/store-earnings/queries";
import { StoreEarningsClient } from "@/modules/store-earnings/components/store-earnings-client";

export default async function StoreEarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; month?: string }>;
}) {
  const access = await requireAccess("store_earnings");
  const sp = await searchParams;

  const stores = await listStoresForUser(access.profile.id, access.isAdmin);
  const storeId = sp.store && stores.some((s) => s.id === sp.store) ? sp.store : (stores[0]?.id ?? null);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date().toISOString().slice(0, 7);

  const summary = storeId ? await getStoreEarnings(storeId, month) : null;

  return <StoreEarningsClient stores={stores} storeId={storeId} month={month} summary={summary} />;
}
