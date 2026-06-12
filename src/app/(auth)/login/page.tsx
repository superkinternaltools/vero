import { AuthCard } from "@/modules/auth/components/auth-card";
import { LoginForm } from "@/modules/auth/components/login-form";

export default function LoginPage() {
  return (
    <AuthCard title="Login to Account" subtitle="Please enter your details to continue">
      <LoginForm />
    </AuthCard>
  );
}
