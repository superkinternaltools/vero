import { requireAccess } from "@/core/auth/access";
import { listStores } from "@/modules/stores/queries";
import { StoresClient } from "@/modules/stores/components/stores-client";

export default async function StoresPage() {
  await requireAccess("stores");
  const stores = await listStores();
  return <StoresClient stores={stores} />;
}
