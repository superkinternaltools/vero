"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";

export type AuthActionState = { error: string } | null;

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Could not sign you in. Please try again." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.status === "inactive") {
    await supabase.auth.signOut();
    return { error: "Your account is inactive. Contact an admin." };
  }
  if (profile?.status === "active") redirect("/");
  redirect("/pending");
}

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("name") ?? "").trim();
  if (!email || !password) return { error: "Enter your email and password." };
  if (!displayName) return { error: "Enter your display name." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) return { error: error.message };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Save declared stores as a hint for the admin during mapping
    const storeIdsRaw = String(formData.get("store_ids") ?? "");
    const signupStoreIds = storeIdsRaw
      ? storeIdsRaw.split(",").filter((x) => x.trim())
      : [];

    if (signupStoreIds.length) {
      const admin = createAdminClient();
      await admin
        .from("profiles")
        .update({ signup_store_ids: signupStoreIds })
        .eq("id", user.id);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.status === "active") redirect("/");
  }
  redirect("/pending");
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = await createClient();
  const origin =
    (await headers()).get("origin") ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data?.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
