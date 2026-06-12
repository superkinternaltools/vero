"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";
import { getCurrentProfile } from "@/core/auth/session";
import type { UserStatus } from "./types";

type Result = { error?: string };

export async function approveUser(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status: "active" })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/users");
  return {};
}

export async function updateUser(
  id: string,
  values: {
    display_name: string;
    status: UserStatus;
    is_admin: boolean;
    job_title_id: string | null;
    roleIds: string[];
    departmentIds: string[];
    storeIds: string[];
  },
): Promise<Result> {
  const me = await getCurrentProfile();
  if (me && me.id === id && (!values.is_admin || values.status !== "active")) {
    return { error: "You can't remove your own admin access or deactivate yourself." };
  }

  const supabase = await createClient();

  const { error: pErr } = await supabase
    .from("profiles")
    .update({
      display_name: values.display_name || null,
      status: values.status,
      is_admin: values.is_admin,
      job_title_id: values.job_title_id,
    })
    .eq("id", id);
  if (pErr) return { error: pErr.message };

  await supabase.from("user_roles").delete().eq("user_id", id);
  if (values.roleIds.length)
    await supabase
      .from("user_roles")
      .insert(values.roleIds.map((role_id) => ({ user_id: id, role_id })));

  await supabase.from("user_departments").delete().eq("user_id", id);
  if (values.departmentIds.length)
    await supabase
      .from("user_departments")
      .insert(values.departmentIds.map((department_id) => ({ user_id: id, department_id })));

  await supabase.from("user_stores").delete().eq("user_id", id);
  if (values.storeIds.length)
    await supabase
      .from("user_stores")
      .insert(values.storeIds.map((store_id) => ({ user_id: id, store_id })));

  revalidatePath("/users");
  return {};
}

export async function inviteUser(email: string, displayName: string): Promise<Result> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };

  const addr = email.trim().toLowerCase();
  if (!addr || !addr.includes("@")) return { error: "Enter a valid email address." };

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(addr, {
    data: displayName.trim() ? { display_name: displayName.trim() } : undefined,
    redirectTo: `${origin}/auth/callback`,
  });
  if (error) return { error: error.message };

  revalidatePath("/users");
  return {};
}
