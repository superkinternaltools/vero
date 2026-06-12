import { AuthCard } from "@/modules/auth/components/auth-card";
import { SignupForm } from "@/modules/auth/components/signup-form";

export default function SignupPage() {
  return (
    <AuthCard title="Create an Account" subtitle="Create an account to continue">
      <SignupForm />
    </AuthCard>
  );
}
