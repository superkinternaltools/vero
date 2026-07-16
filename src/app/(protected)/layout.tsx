import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/core/auth/session";
import { getAccess } from "@/core/auth/access";
import { AppShell } from "@/core/layout/app-shell";
import { userHasAssignments } from "@/modules/attendance/queries";

/** Guards the authenticated app area and wraps it in the app shell. */
export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.status === "pending") redirect("/pending");
  if (profile.status === "inactive") redirect("/login");

  const access = await getAccess();
  const allowed = [...(access?.allowed ?? ["dashboard"])];

  // The punch screen is reachable by anyone who has a current roster
  // assignment, independent of the module-permission matrix.
  if (await userHasAssignments(profile.id)) allowed.push("attendance_punch");

  return (
    <AppShell
      displayName={profile.display_name ?? profile.email}
      email={profile.email}
      allowed={allowed}
    >
      {children}
    </AppShell>
  );
}
