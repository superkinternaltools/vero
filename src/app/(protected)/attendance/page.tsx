import { requireAccess } from "@/core/auth/access";
import { getAttendanceLog } from "@/modules/attendance/queries";
import { AttendanceLogClient } from "@/modules/attendance/components/attendance-log-client";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const access = await requireAccess("attendance");
  const { date } = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const log = await getAttendanceLog(d, { userId: access.profile.id, isAdmin: access.isAdmin });
  return <AttendanceLogClient log={log} date={d} today={today} />;
}
