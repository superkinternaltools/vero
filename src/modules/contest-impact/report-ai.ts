import OpenAI from "openai";
import { DIAGNOSIS_VERDICT_LABELS } from "./types";
import type { ContestDiagnosis, ContestMonthReport, ContestReportNarrative } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const WORKING_VERDICTS = new Set(["working", "working_caveat"]);

/** Same data shape as the headline's context, plus the diagnosis itself —
 * the model is told the verdict/trend/root cause up front and is never
 * asked to decide them. */
function buildReportContext(campaignLabel: string, month: string, report: ContestMonthReport, diagnosis: ContestDiagnosis) {
  const gmv = report.metrics.find((m) => m.key === "gmv");
  const doh = report.metrics.find((m) => m.key === "doh");
  return {
    campaign: campaignLabel,
    month,
    diagnosis: {
      verdict: diagnosis.verdict,
      verdictLabel: DIAGNOSIS_VERDICT_LABELS[diagnosis.verdict],
      trend: diagnosis.trend,
      selectionBiasCaveat: diagnosis.selectionBiasCaveat,
      evidence: diagnosis.evidence,
    },
    verdict: report.verdict,
    weeklyGroupCounts: report.weeklyGroupCounts,
    gmv: gmv && { monthAvg: gmv.monthAvg, monthGrowthVsLastMonth: gmv.monthGrowthVsLastMonth },
    doh: doh && { monthAvg: doh.monthAvg },
    storeAvailability: report.stock.avgStoreAvailability,
    warehouseAvailability: report.stock.avgWhAvailability,
    lastYear: report.lastYear,
  };
}

export function computeReportFingerprint(campaignLabel: string, month: string, report: ContestMonthReport, diagnosis: ContestDiagnosis): string {
  return JSON.stringify(buildReportContext(campaignLabel, month, report, diagnosis));
}

/** The prompt tells the model never to pair a minus sign with a direction
 * word ("shortfall", "underperformed", ...) for the same number, and it
 * still does it occasionally ("shortfall of -29.17%", "underperformed by
 * -2.7pp"). Rather than keep tuning wording and hoping, this strips the
 * minus sign whenever one of these words sits next to a signed number —
 * a deterministic backstop, not a full grammar fix. */
function fixDoubleNegatives(text: string): string {
  const directionWords = "shortfall|short|drop(?:ped)?|declin(?:e|ed|ing)|deficit|underperform(?:ed|ance)?|below|lower|negative";
  return text
    // "shortfall of -29.17%" / "underperformed by -2.7pp" — word first, number after
    .replace(new RegExp(`\\b(${directionWords})(\\s+\\w+){0,2}?\\s+-(\\d+(?:\\.\\d+)?)`, "gi"), (m) => m.replace(/-(?=\d)/, ""))
    // "-29.17% shortfall" / "-2.7pp underperformance" — number first, word after
    .replace(new RegExp(`-(\\d+(?:\\.\\d+)?)((?:\\s*(?:pp|%))?\\s+(?:\\w+\\s+){0,2}(?:${directionWords}))`, "gi"), "$1$2");
}

const SYSTEM_PROMPT = `You are Vero's Contest Impact analyst for SuperK, a retail chain. You write the narrative for one campaign's "Is it working?" report.

THE VERDICT IS ALREADY DECIDED — READ THIS FIRST: a separate, deterministic rule engine has already classified this month as one of seven states (given to you as "diagnosis.verdict") and, if relevant, picked a specific root cause and trend. YOUR JOB IS ONLY TO EXPLAIN WHY THE DATA SUPPORTS THAT VERDICT, using the numbers in "diagnosis.evidence". Do not second-guess it, soften it, contradict it, or reach a different conclusion in your own writing — if your narrative and the verdict disagree, you are wrong, not the verdict.

THE SEVEN VERDICTS AND WHAT THEY MEAN:
- working: approved stores' incremental value vs. control is clearly positive, and it's not just a stock illusion.
- working_caveat: same positive lift, but poor-execution stores have similar or higher raw GMV than approved — driven by poor carrying more stock, not converting better (approvedSellThrough is higher than poorSellThrough despite this). Say this explicitly; it's the whole point of this verdict.
- not_working_supply_store: the lift isn't there, and approved stores' own store-level availability is low — stock isn't reaching the shelf, so this isn't an execution-quality problem.
- not_working_supply_warehouse: the lift isn't there, store availability is fine, but warehouse availability is low — stock isn't leaving the DC in the first place.
- not_working_rubric: the lift isn't there, supply is fine, but poor (unapproved) execution is ALSO beating control by a real margin (see poorVsControlGrowthPtDiff) — meaning having a display at all is what's working, not the approval step. The approval gate isn't adding value, regardless of how sellThrough compares between approved and poor.
- not_working_demand: the lift isn't there, supply is fine, and poor is NOT clearing control's bar either — neither good nor bad execution is beating the baseline this month, so this isn't about execution quality at all; likely a demand/seasonality/category issue.
- inconclusive: too few approved stores, or missing baseline data, to say either way with confidence.

DATA YOU'RE GIVEN:
- diagnosis.evidence: incrementalValueVsLastMonth (₹) and incrementalPctOfBaseline (%) are BOTH the same diff-in-diff — approved stores' actual sales this month minus what they'd be expected to make if they'd simply grown at exactly control's own month-on-month rate, expressed as a rupee amount and as a % of last month's approved baseline. This is NOT approved's month-on-month change — approved's own sales could have risen and this number still be negative, if control rose even more. Never describe it as a "drop" or "decline" from last month; describe it as coming in above or below what control's own trend implied ("approved came in ₹X / Y% short of what control's trend implied", not "sales dropped Y%"). approvedSellThrough/poorSellThrough are themselves already percentages (write as "13.5%", not a 0-1 ratio) — approvedVsPoorSellThroughPct is the RELATIVE % difference between those two percentages (not a point gap — secondary context, not what decided rubric-vs-demand); if you instead want to state the raw point gap between them, call it "pp" explicitly so it's never confused with the relative-% figure. poorVsControlGrowthPtDiff (percentage-POINT gap — THIS is what decided rubric-vs-demand: positive and above ~3pp means poor is also beating control), approvedStoreAvailability/warehouseAvailability (%), approvedStoreCount.
- diagnosis.trend: "improving"/"stable"/"fading"/null — how the approved group's GMV moved from the first half of the month's weeks to the second half. Mention it only if it changes the reading (e.g. "working, but fading" is a materially different story than "working" alone).
- diagnosis.selectionBiasCaveat: true means fewer than half of approved stores have last-year data — when true, note in the mechanism (briefly, one clause) that this month's comparison leans on the control-group baseline rather than year-on-year, since approved and control stores' pre-contest comparability can't be fully verified.
- gmv, doh, storeAvailability, warehouseAvailability, lastYear: supporting context, same shape as elsewhere in this app.

WRITE, as JSON:
- "verdictSentence": ONE sentence, under 22 words, stating the verdict in plain language with its single most important number — this sits right under the verdict badge, so it should read as the headline of the whole report.
- "mechanism": 3-5 sentences explaining HOW the data supports this verdict — cite the specific evidence numbers, always paired with what they mean (never a bare number). Fold in the trend and the selection-bias caveat when they're relevant, not as a bolted-on afterthought.
- "rootCause": for any "not_working_*" verdict, 2-4 sentences naming the specific cause (supply/rubric/demand) and what it implies SuperK should look at next. For "working", "working_caveat", or "inconclusive" verdicts, return an empty string "" — there is no separate root cause to explain.

UNITS: sellThrough is already a % (write "13.5%", never "0.135x"); doh always with a "d" suffix. Rupee figures always ₹. incrementalPctOfBaseline and approvedVsPoorSellThroughPct are relative percentages, not percentage points; poorVsControlGrowthPtDiff is a percentage-point gap ("pp"), not a percent. A raw point gap between two sellThrough percentages is also "pp", never plain "%". Never state two numbers next to each other without saying what the gap means.

NEVER DOUBLE UP ON SIGN AND WORDING: a word like "drop", "decline", "shortfall", "below", "less", or "underperformed" already states the direction — pairing it with a negative sign reads as a double negative ("a -10.1% drop" is wrong). If the number is negative, either drop the minus sign and use a direction word ("came in 10.1% short of..."), or keep the signed number and a neutral verb ("changed by -10.1%") — never both a minus sign and a direction word for the same number.

No markdown, no bullet points, no restating "this report" or "this month". Write as if it sits directly on the page under a colored verdict badge.

BEFORE YOU ANSWER, CHECK EVERY SENTENCE YOU WROTE — rewrite silently if any check fails, then respond with only the final JSON:
1. Does any sentence pair a minus sign with "drop"/"decline"/"shortfall"/"below"/"less"/"underperformed"/"lower" for the same number? (e.g. "underperformed by -2.7pp" is wrong — say "underperformed by 2.7pp" or "changed by -2.7pp".) Fix every instance, not just the first one you find.
2. Does the verdictSentence or mechanism describe incrementalValueVsLastMonth/incrementalPctOfBaseline as a month-on-month "drop" or "decline"? It is not — it is a shortfall against what control's trend implied. Reword any instance.
3. Does the narrative center the correct verdict (diagnosis.verdict), not a different one you drifted toward while writing?

Respond ONLY with JSON: {"verdictSentence": "...", "mechanism": "...", "rootCause": "..."}.`;

export async function generateContestReportNarrative(params: {
  campaignLabel: string;
  month: string;
  report: ContestMonthReport;
  diagnosis: ContestDiagnosis;
  previous?: { month: string; verdictSentence: string; mechanism: string } | null;
}): Promise<ContestReportNarrative | { error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: "AI report isn't configured — missing OPENAI_API_KEY." };

  const openai = new OpenAI({ apiKey });
  const context = buildReportContext(params.campaignLabel, params.month, params.report, params.diagnosis);

  const userContent = [
    `DATA FOR ${params.campaignLabel}, ${params.month}:`,
    JSON.stringify(context),
    params.previous
      ? `\nPREVIOUS MONTH'S REPORT (${params.previous.month}), for continuity only: "${params.previous.verdictSentence}" — ${params.previous.mechanism}`
      : "",
  ].join("\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
  });

  let parsed: any;
  try {
    parsed = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
  } catch {
    return { error: "The AI returned something unparseable." };
  }

  const verdictSentence = typeof parsed.verdictSentence === "string" ? parsed.verdictSentence.trim() : "";
  const mechanism = typeof parsed.mechanism === "string" ? parsed.mechanism.trim() : "";
  const rootCause = typeof parsed.rootCause === "string" ? parsed.rootCause.trim() : "";
  if (!verdictSentence || !mechanism) return { error: "The AI didn't return a usable report." };
  if (!WORKING_VERDICTS.has(params.diagnosis.verdict) && params.diagnosis.verdict !== "inconclusive" && !rootCause) {
    return { error: "The AI didn't explain the root cause." };
  }

  return {
    verdictSentence: fixDoubleNegatives(verdictSentence),
    mechanism: fixDoubleNegatives(mechanism),
    rootCause: fixDoubleNegatives(rootCause),
  };
}
