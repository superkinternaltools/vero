import { createClient } from "@/core/db/server";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getSettings(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  const out: Record<string, string> = {};
  for (const r of (data as any[]) ?? []) out[r.key] = r.value ?? "";
  return out;
}

export type RoleWithLanding = {
  id: string;
  slug: string;
  name: string;
  landing_page: string | null;
};

export async function getRolesWithPermissions(): Promise<{
  roles: RoleWithLanding[];
  granted: Record<string, string[]>;
}> {
  const supabase = await createClient();
  const [{ data: roles }, { data: perms }] = await Promise.all([
    supabase.from("roles").select("id, slug, name, landing_page").order("name"),
    supabase.from("role_permissions").select("role_id, permission"),
  ]);
  const granted: Record<string, string[]> = {};
  for (const p of (perms as any[]) ?? []) {
    granted[p.role_id] = granted[p.role_id] ?? [];
    granted[p.role_id].push(p.permission);
  }
  return { roles: (roles as RoleWithLanding[]) ?? [], granted };
}
