import { listStores } from "@/modules/stores/queries";
import { AuthCard } from "@/modules/auth/components/auth-card";
import { SignupForm } from "@/modules/auth/components/signup-form";

export default async function SignupPage() {
  const stores = await listStores();
  const storeOpts = stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }));

  return (
    <AuthCard title="Create an Account" subtitle="Create an account to continue">
      <SignupForm stores={storeOpts} />
    </AuthCard>
  );
}
