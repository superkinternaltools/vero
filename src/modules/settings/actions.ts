"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import { getCurrentProfile } from "@/core/auth/session";

export async function saveSettings(values: Record<string, string>): Promise<{ error?: string }> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };
  const supabase = await createClient();
  const rows = Object.entries(values).map(([key, value]) => ({ key, value }));
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return {};
}

export async function setRolePermission(
  roleId: string,
  permission: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };
  const supabase = await createClient();
  const { error } = enabled
    ? await supabase.from("role_permissions").upsert({ role_id: roleId, permission })
    : await supabase
        .from("role_permissions")
        .delete()
        .eq("role_id", roleId)
        .eq("permission", permission);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return {};
}

export async function setRoleLanding(
  roleId: string,
  landing: string,
): Promise<{ error?: string }> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("roles")
    .update({ landing_page: landing || null })
    .eq("id", roleId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return {};
}
