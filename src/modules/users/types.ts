export type UserStatus = "pending" | "active" | "inactive";

export type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  status: UserStatus;
  is_admin: boolean;
  job_title_id: string | null;
  jobTitleName: string | null;
  roleIds: string[];
  roleNames: string[];
  departmentIds: string[];
  departmentNames: string[];
  storeIds: string[];
};
