"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Input } from "@/core/ui/input";
import { Button } from "@/core/ui/button";
import { MultiSelect } from "@/core/ui/multi-select";
import { GoogleIcon } from "./google-icon";
import { OrDivider } from "./or-divider";
import { signUpAction, signInWithGoogle } from "@/modules/auth/actions";

type StoreOpt = { id: string; label: string };

export function SignupForm({ stores = [] }: { stores?: StoreOpt[] }) {
  const [state, formAction, pending] = useActionState(signUpAction, null);
  const [storeIds, setStoreIds] = useState<string[]>([]);

  function handleSelectAll() {
    setStoreIds(stores.map((s) => s.id));
  }

  return (
    <div>
      <form action={signInWithGoogle}>
        <Button type="submit" variant="outline" className="w-full">
          <GoogleIcon className="shrink-0" />
          Sign up with Google
        </Button>
      </form>

      <OrDivider />

      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium text-foreground">
            Email address
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@superk.in"
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="name" className="block text-sm font-medium text-foreground">
            Display name
          </label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="e.g. Anuj Dalvi"
            autoComplete="name"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-foreground">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
        </div>

        {stores.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">
                Your stores{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              {stores.length > 1 && storeIds.length < stores.length && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs text-primary hover:underline"
                >
                  Select all
                </button>
              )}
            </div>
            <MultiSelect
              options={stores}
              selected={storeIds}
              onChange={setStoreIds}
              placeholder="Select the stores you cover…"
            />
            <p className="text-xs text-muted-foreground">
              Helps your admin find you faster during setup.
            </p>
            {/* Hidden input so server action can read the IDs */}
            <input type="hidden" name="store_ids" value={storeIds.join(",")} />
          </div>
        )}

        {state?.error && <p className="text-sm font-medium text-danger">{state.error}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
