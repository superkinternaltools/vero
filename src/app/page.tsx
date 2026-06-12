import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/core/auth/session";
import { getAccess } from "@/core/auth/access";

export default async function Home() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active") redirect("/pending");
  const access = await getAccess();
  redirect(access?.landing ?? "/dashboard");
}
