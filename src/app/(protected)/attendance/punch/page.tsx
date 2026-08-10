import { requireAccess } from "@/core/auth/access";
import { getPunchContext } from "@/modules/attendance/queries";
import { PunchClient } from "@/modules/attendance/components/punch-client";

export default async function PunchPage() {
  const access = await requireAccess("attendance_punch");
  const ctx = await getPunchContext(access.profile.id);
  return <PunchClient ctx={ctx} />;
}
