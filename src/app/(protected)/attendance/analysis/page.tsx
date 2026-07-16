import { requireAccess } from "@/core/auth/access";
import { getWeeklyAnalysis } from "@/modules/attendance/queries";
import { WeeklyAnalysisClient } from "@/modules/attendance/components/weekly-analysis-client";

/** Monday of the ISO week containing `iso` (IST-agnostic date math). */
function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default async function AttendanceAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireAccess("attendance");
  const { week } = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const weekStart = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const { rows, days } = await getWeeklyAnalysis(weekStart);
  return <WeeklyAnalysisClient rows={rows} days={days} weekStart={weekStart} />;
}
