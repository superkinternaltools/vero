import { redirect } from "next/navigation";
import { createClient } from "@/core/db/server";
import { getCurrentProfile, type Profile } from "./session";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { PERMISSION_KEYS } from "./permissions";
export { PERMISSION_KEYS };

export type Access = {
  profile: Profile;
  allowed: string[];
  landing: string;
  isAdmin: boolean;
};

const ALL_KEYS = PERMISSION_KEYS.map((p) => p.key as string);

/** Resolves the signed-in user's allowed modules + landing page. Null if not active. */
export async function getAccess(): Promise<Access | null> {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "active") return null;

  if (profile.is_admin) {
    return {
      profile,
      allowed: [...ALL_KEYS, "settings", "export"],
      landing: "/dashboard",
      isAdmin: true,
    };
  }

  const supabase = await createClient();
  const { data: ur } = await supabase
    .from("user_roles")
    .select("role_id, roles ( landing_page )")
    .eq("user_id", profile.id);

  const roleIds = ((ur as any[]) ?? []).map((r) => r.role_id);
  const allowed = new Set<string>(["dashboard"]); // dashboard is always reachable
  let landing: string | null = null;

  if (roleIds.length > 0) {
    const { data: perms } = await supabase
      .from("role_permissions")
      .select("permission")
      .in("role_id", roleIds);
    for (const p of (perms as any[]) ?? []) allowed.add(p.permission);
    landing =
      ((ur as any[]) ?? [])
        .map((r) => r.roles?.landing_page as string | null)
        .find((l) => !!l) ?? null;
  }

  // Store Earnings is granted by store assignment, not role — anyone with
  // stores under them (Store Partner, SAE, or any other job title) sees
  // their own earnings automatically, regardless of the role-permission
  // matrix. A role can still be granted it explicitly above; this only adds
  // it when that hasn't already happened.
  if (!allowed.has("store_earnings")) {
    const { count } = await supabase
      .from("user_stores")
      .select("store_id", { count: "exact", head: true })
      .eq("user_id", profile.id);
    if ((count ?? 0) > 0) allowed.add("store_earnings");
  }

  // landing must point at an allowed module
  const landingKey = (landing ?? "/dashboard").replace(/^\//, "");
  const safeLanding = allowed.has(landingKey) ? `/${landingKey}` : "/dashboard";

  return { profile, allowed: [...allowed], landing: safeLanding, isAdmin: false };
}

/** Page guard: redirects to login/pending, or to the user's landing if the module isn't allowed. */
export async function requireAccess(key: string): Promise<Access> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.status === "pending") redirect("/pending");
  if (profile.status === "inactive") redirect("/login");

  const access = await getAccess();
  if (!access) redirect("/login");
  if (!access.allowed.includes(key)) redirect(access.landing);
  return access;
}
