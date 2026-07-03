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

export async function bulkApproveUsers(ids: string[]): Promise<Result> {
  if (!ids.length) return {};
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ status: "active" }).in("id", ids);
  if (error) return { error: error.message };
  revalidatePath("/users");
  return {};
}

export async function bulkSetRole(ids: string[], roleId: string): Promise<Result> {
  if (!ids.length) return {};
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };
  const supabase = await createClient();
  await supabase.from("user_roles").delete().in("user_id", ids);
  if (roleId)
    await supabase
      .from("user_roles")
      .insert(ids.map((user_id) => ({ user_id, role_id: roleId })));
  revalidatePath("/users");
  return {};
}

export async function bulkSetDepartment(ids: string[], departmentId: string): Promise<Result> {
  if (!ids.length) return {};
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };
  const supabase = await createClient();
  await supabase.from("user_departments").delete().in("user_id", ids);
  if (departmentId)
    await supabase
      .from("user_departments")
      .insert(ids.map((user_id) => ({ user_id, department_id: departmentId })));
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

// ── Shell user helpers ──────────────────────────────────────────────────────

function generateShellId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "SK-";
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export async function createShellUser(values: {
  display_name: string;
  job_title_id: string | null;
  role_id: string | null;
  storeIds: string[];
}): Promise<Result & { id?: string }> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const id = generateShellId();

  const { error } = await supabase.from("shell_users").insert({
    id,
    display_name: values.display_name.trim(),
    job_title_id: values.job_title_id || null,
    role_id: values.role_id || null,
  });
  if (error) return { error: error.message };

  if (values.storeIds.length) {
    await supabase
      .from("shell_user_stores")
      .insert(values.storeIds.map((store_id) => ({ shell_user_id: id, store_id })));
  }

  revalidatePath("/users");
  return { id };
}

export async function updateShellUser(
  id: string,
  values: {
    display_name: string;
    job_title_id: string | null;
    role_id: string | null;
    storeIds: string[];
  },
): Promise<Result> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shell_users")
    .update({
      display_name: values.display_name.trim(),
      job_title_id: values.job_title_id || null,
      role_id: values.role_id || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await supabase.from("shell_user_stores").delete().eq("shell_user_id", id);
  if (values.storeIds.length) {
    await supabase
      .from("shell_user_stores")
      .insert(values.storeIds.map((store_id) => ({ shell_user_id: id, store_id })));
  }

  revalidatePath("/users");
  return {};
}

export async function deleteShellUser(id: string): Promise<Result> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  await supabase.from("shell_users").delete().eq("id", id);
  revalidatePath("/users");
  return {};
}

export type BulkShellRow = {
  id: string;
  display_name: string;
  job_title_id: string | null;
  role_id: string | null;
  storeIds: string[];
};

export async function bulkCreateShellUsers(
  users: BulkShellRow[],
): Promise<Result & { created?: number }> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };
  if (!users.length) return { created: 0 };

  const supabase = await createClient();

  const { error } = await supabase.from("shell_users").upsert(
    users.map((u) => ({
      id: u.id,
      display_name: u.display_name,
      job_title_id: u.job_title_id || null,
      role_id: u.role_id || null,
    })),
  );
  if (error) return { error: error.message };

  const storeRows = users.flatMap((u) =>
    u.storeIds.map((store_id) => ({ shell_user_id: u.id, store_id })),
  );
  if (storeRows.length) {
    await supabase.from("shell_user_stores").upsert(storeRows);
  }

  revalidatePath("/users");
  return { created: users.length };
}

export async function mapUserToShell(
  profileId: string,
  shellId: string,
): Promise<Result> {
  const me = await getCurrentProfile();
  if (!me?.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();

  const { data: shell } = await supabase
    .from("shell_users")
    .select("id, display_name, job_title_id, role_id, shell_user_stores ( store_id )")
    .eq("id", shellId)
    .maybeSingle();

  if (!shell) return { error: "Shell user not found." };
  const s = shell as any;

  await supabase
    .from("profiles")
    .update({
      status: "active",
      job_title_id: s.job_title_id,
      display_name: s.display_name || undefined,
    })
    .eq("id", profileId);

  if (s.role_id) {
    await supabase.from("user_roles").delete().eq("user_id", profileId);
    await supabase
      .from("user_roles")
      .insert({ user_id: profileId, role_id: s.role_id });
  }

  const storeIds: string[] = (s.shell_user_stores ?? []).map((x: any) => x.store_id);
  if (storeIds.length) {
    await supabase.from("user_stores").delete().eq("user_id", profileId);
    await supabase
      .from("user_stores")
      .insert(storeIds.map((store_id) => ({ user_id: profileId, store_id })));
  }

  await supabase.from("shell_users").delete().eq("id", shellId);

  revalidatePath("/users");
  return {};
}
