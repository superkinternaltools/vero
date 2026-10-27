import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/core/db/server";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  status: "pending" | "active" | "inactive";
  is_admin: boolean;
};

/** Returns the current user's profile, or null if not signed in. Memoized per
 * request: the layout, the page guard and the page itself all ask for it, and
 * each ask used to be its own auth + profile round trip. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, display_name, status, is_admin, deleted_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || (profile as unknown as { deleted_at: string | null }).deleted_at) return null;
  return profile as Profile;
});

/** Ensures the current user is an active admin, else redirects. Returns the profile. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active") redirect("/pending");
  if (!profile.is_admin) redirect("/dashboard");
  return profile;
}
