import type { ContestDiagnosis, ContestMonthReport, DiagnosisTrend, DiagnosisVerdict } from "./types";

const MIN_APPROVED_STORES = 3;
/** Below this, the incremental lift is treated as noise-level, not a real win. */
const WORKING_THRESHOLD_PCT = 3;
/** Below this store/warehouse availability, "not working" is attributed to
 * supply rather than execution or the display mechanic. */
const LOW_AVAILABILITY_THRESHOLD = 70;
/** Above this percentage-point gap, poor (unapproved) execution is clearly
 * beating control on its own — meaning having a display at all is what's
 * working, not the approval step. Below it, neither quality level is beating
 * control, which points at demand rather than the rubric. */
const POOR_BEATS_CONTROL_THRESHOLD_PT = 3;
/** Week-over-week (first half vs second half) change beyond this is a real
 * trend, not noise. */
const TREND_THRESHOLD_PCT = 10;

function pctDelta(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

function computeTrend(report: ContestMonthReport): DiagnosisTrend {
  const gmv = report.metrics.find((m) => m.key === "gmv");
  if (!gmv) return null;
  const approvedWeekly = gmv.weekly.map((w) => w.value.approved).filter((v): v is number => v != null);
  if (approvedWeekly.length < 2) return null;

  const mid = Math.ceil(approvedWeekly.length / 2);
  const firstHalf = approvedWeekly.slice(0, mid);
  const secondHalf = approvedWeekly.slice(mid);
  if (!secondHalf.length) return null;

  const avg = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;
  const change = pctDelta(avg(secondHalf), avg(firstHalf));
  if (change == null) return null;
  if (change >= TREND_THRESHOLD_PCT) return "improving";
  if (change <= -TREND_THRESHOLD_PCT) return "fading";
  return "stable";
}

/** Deterministic verdict + root cause — the AI never decides any of this, it
 * only narrates whichever branch this picks, using the evidence attached. */
export function diagnoseContest(report: ContestMonthReport): ContestDiagnosis {
  const { verdict } = report;
  const gmv = report.metrics.find((m) => m.key === "gmv")!;
  const sellThrough = report.metrics.find((m) => m.key === "sellThrough");

  const approvedSellThrough = sellThrough?.monthAvg.approved ?? null;
  const poorSellThrough = sellThrough?.monthAvg.poor ?? null;
  const approvedVsPoorSellThroughPct = pctDelta(approvedSellThrough, poorSellThrough);
  const approvedStoreAvailability = report.stock.avgStoreAvailability.approved;
  const warehouseAvailability = report.stock.avgWhAvailability;
  const poorVsControlGrowthPtDiff =
    verdict.poorGrowthVsLastMonth != null && verdict.controlGrowthVsLastMonth != null
      ? verdict.poorGrowthVsLastMonth - verdict.controlGrowthVsLastMonth
      : null;

  const incrementalPctOfBaseline =
    verdict.incrementalValueVsLastMonth != null && verdict.approvedGmvLastMonth
      ? (verdict.incrementalValueVsLastMonth / verdict.approvedGmvLastMonth) * 100
      : null;

  const evidence = {
    incrementalValueVsLastMonth: verdict.incrementalValueVsLastMonth,
    incrementalPctOfBaseline,
    approvedSellThrough,
    poorSellThrough,
    approvedVsPoorSellThroughPct,
    poorVsControlGrowthPtDiff,
    approvedStoreAvailability,
    warehouseAvailability,
    approvedStoreCount: verdict.approvedStoreCount,
  };

  const selectionBiasCaveat = report.lastYear.approvedStoresTotal > 0 && report.lastYear.approvedStoresWithData < report.lastYear.approvedStoresTotal;
  const trend = computeTrend(report);

  let diagnosisVerdict: DiagnosisVerdict;

  if (verdict.approvedStoreCount < MIN_APPROVED_STORES || incrementalPctOfBaseline == null) {
    diagnosisVerdict = "inconclusive";
  } else if (incrementalPctOfBaseline > WORKING_THRESHOLD_PCT) {
    const approvedGmvAvg = gmv.monthAvg.approved;
    const poorGmvAvg = gmv.monthAvg.poor;
    const gmvRankingMisleading =
      approvedGmvAvg != null && poorGmvAvg != null && poorGmvAvg >= approvedGmvAvg &&
      approvedSellThrough != null && poorSellThrough != null && approvedSellThrough > poorSellThrough;
    diagnosisVerdict = gmvRankingMisleading ? "working_caveat" : "working";
  } else if (approvedStoreAvailability != null && approvedStoreAvailability < LOW_AVAILABILITY_THRESHOLD) {
    diagnosisVerdict = "not_working_supply_store";
  } else if (warehouseAvailability != null && warehouseAvailability < LOW_AVAILABILITY_THRESHOLD) {
    diagnosisVerdict = "not_working_supply_warehouse";
  } else if (poorVsControlGrowthPtDiff != null && poorVsControlGrowthPtDiff > POOR_BEATS_CONTROL_THRESHOLD_PT) {
    // Unapproved execution is ALSO beating control — the display works
    // regardless of approval, so the approval gate isn't what's adding
    // value. (Not decided by approved-vs-poor sell-through: that comparison
    // is too easily muddied by lumping different poor statuses together —
    // this is decided by whether poor clears the same control bar approved
    // is failing to clear.)
    diagnosisVerdict = "not_working_rubric";
  } else {
    // Neither approved nor poor execution is beating control this month —
    // not a rubric problem, since being "approved" isn't the difference.
    diagnosisVerdict = "not_working_demand";
  }

  return { verdict: diagnosisVerdict, trend, selectionBiasCaveat, evidence };
}
