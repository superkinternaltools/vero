/** Module keys that can be granted per role (Settings is always admin-only).
 *  Shared by server guards and client UI — keep this file import-free. */
export const PERMISSION_KEYS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "tasks", label: "Tasks" },
  { key: "review", label: "Review" },
  { key: "campaigns", label: "Campaigns" },
  { key: "summary", label: "Summary" },
  { key: "analysis", label: "Analysis" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "attendance", label: "Attendance" },
  { key: "stores", label: "Stores" },
  { key: "users", label: "Users" },
  { key: "org", label: "Roles & Departments" },
] as const;
