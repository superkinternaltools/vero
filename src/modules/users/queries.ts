import { createClient } from "@/core/db/server";
import type { UserRow } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function listUsers(): Promise<UserRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      `
      id, email, display_name, status, is_admin, job_title_id,
      job_titles ( name ),
      user_roles ( role_id, roles ( name ) ),
      user_departments ( department_id, departments ( name ) ),
      user_stores ( store_id )
      `,
    )
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
  }));
}
