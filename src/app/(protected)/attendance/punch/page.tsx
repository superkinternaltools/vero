import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/core/auth/session";
import { getPunchContext } from "@/modules/attendance/queries";
import { PunchClient } from "@/modules/attendance/components/punch-client";

export default async function PunchPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  const ctx = await getPunchContext(me.id);
  return <PunchClient ctx={ctx} />;
}
