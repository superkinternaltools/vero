"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/core/ui/input";
import { Button } from "@/core/ui/button";
import { GoogleIcon } from "./google-icon";
import { OrDivider } from "./or-divider";
import { signInAction, signInWithGoogle } from "@/modules/auth/actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, null);

  return (
    <div>
      <form action={signInWithGoogle}>
        <Button type="submit" variant="outline" className="w-full">
          <GoogleIcon className="shrink-0" />
          Continue with Google
        </Button>
      </form>

      <OrDivider />

      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium text-foreground">
            Email address
          </label>
          <Input id="email" name="email" type="email" placeholder="you@superk.in" autoComplete="email" required />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              Password
            </label>
            <Link href="#" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" name="password" type="password" placeholder="••••••••" autoComplete="current-password" required />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="h-4 w-4 rounded border-border accent-[var(--primary)]"
          />
          Remember me
        </label>

        {state?.error && (
          <p className="text-sm font-medium text-danger">{state.error}</p>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-semibold text-primary hover:underline">
          Create account
        </Link>
      </p>
    </div>
  );
}
