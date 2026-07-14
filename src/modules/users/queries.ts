import { createClient } from "@/core/db/server";
import type { UserRow, ShellUser } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function listUsers(): Promise<UserRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      `
      id, email, display_name, status, is_admin, job_title_id, signup_store_ids,
      job_titles ( name ),
      user_roles ( role_id, roles ( name ) ),
      user_departments ( department_id, departments ( name ) ),
      user_stores ( store_id )
      `,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  return ((data as any[]) ?? []).map((row): UserRow => ({
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    status: row.status,
    is_admin: row.is_admin,
    job_title_id: row.job_title_id,
    jobTitleName: row.job_titles?.name ?? null,
    roleIds: (row.user_roles ?? []).map((x: any) => x.role_id),
    roleNames: (row.user_roles ?? []).map((x: any) => x.roles?.name).filter(Boolean),
    departmentIds: (row.user_departments ?? []).map((x: any) => x.department_id),
    departmentNames: (row.user_departments ?? [])
      .map((x: any) => x.departments?.name)
      .filter(Boolean),
    storeIds: (row.user_stores ?? []).map((x: any) => x.store_id),
    signupStoreIds: row.signup_store_ids ?? [],
  }));
}

export async function listShellUsers(): Promise<ShellUser[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shell_users")
    .select(
      `
      id, display_name, job_title_id, role_id, created_at,
      job_titles ( name ),
      roles ( name ),
      shell_user_stores ( store_id, stores ( code, name ) )
      `,
    )
    .order("created_at", { ascending: false });

  return ((data as any[]) ?? []).map((row): ShellUser => ({
    id: row.id,
    display_name: row.display_name,
    job_title_id: row.job_title_id,
    jobTitleName: row.job_titles?.name ?? null,
    role_id: row.role_id,
    roleName: row.roles?.name ?? null,
    storeIds: (row.shell_user_stores ?? []).map((s: any) => s.store_id),
    storeLabels: (row.shell_user_stores ?? []).map((s: any) =>
      s.stores ? `${s.stores.code} — ${s.stores.name}` : s.store_id,
    ),
    created_at: row.created_at,
  }));
}
