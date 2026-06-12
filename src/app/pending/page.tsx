import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/core/auth/session";
import { signOutAction } from "@/modules/auth/actions";
import { Button } from "@/core/ui/button";

export default async function PendingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.status === "active") redirect("/dashboard");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex items-center text-2xl font-bold tracking-tight text-foreground">
        Vero<span className="text-primary">.</span>
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Awaiting approval
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is pending admin approval. You&apos;ll get access as soon
          as an admin approves you.
        </p>
        <form action={signOutAction} className="mt-6">
          <Button variant="outline" className="w-full">Sign out</Button>
        </form>
      </div>
    </div>
  );
}
