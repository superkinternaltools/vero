/**
 * One-off ops script: finds every submission — pending, already approved, or
 * already rejected — that never got an AI score (because OpenAI credits ran
 * out) and sends it through scoreSubmission() now that credits are refilled.
 * Reuses the exact same function the real upload path calls, so behavior is
 * identical — nothing here is reimplemented. score.ts guards ai_auto_approve
 * so it never overwrites a human_verdict already on record; this script
 * relies on that guard to safely backfill AI scores onto submissions a
 * reviewer has already decided, without touching their recorded verdict.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/rescore-missing-ai.ts            (dry run — just counts)
 *   npx tsx --env-file=.env.local scripts/rescore-missing-ai.ts --execute  (actually scores)
 */
import { createAdminClient } from "../src/core/db/admin";
import { scoreSubmission } from "../src/modules/ai-review/score";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function fetchAllRows(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  pageSize = 1000,
): Promise<any[]> {
  const results: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) {
      console.error("query page failed:", error);
      break;
    }
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
  }
  return results;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const admin = createAdminClient();

  const submissions = await fetchAllRows((from, to) =>
    admin
      .from("submissions")
      .select("id, campaign_id, status, human_verdict, created_at")
      .is("ai_score", null)
      .order("created_at", { ascending: true })
      .range(from, to),
  );

  const campaigns = await fetchAllRows((from, to) =>
    admin.from("campaigns").select("id, name, ai_review").range(from, to),
  );
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));

  const byCampaign = new Map<string, { name: string; aiReview: boolean; count: number }>();
  for (const s of submissions) {
    const c = campaignById.get(s.campaign_id);
    const key = s.campaign_id;
    const entry = byCampaign.get(key) ?? { name: c?.name ?? "—", aiReview: !!c?.ai_review, count: 0 };
    entry.count += 1;
    byCampaign.set(key, entry);
  }

  const rows = [...byCampaign.values()].sort((a, b) => b.count - a.count);
  const willScore = rows.filter((r) => r.aiReview).reduce((s, r) => s + r.count, 0);
  const wontScore = rows.filter((r) => !r.aiReview).reduce((s, r) => s + r.count, 0);
  const alreadyHumanReviewed = submissions.filter((s) => s.human_verdict).length;

  console.log(`Total submissions with no AI score: ${submissions.length}`);
  console.log(`  → ${willScore} belong to campaigns with AI review ON (will be scored)`);
  console.log(`  → ${wontScore} belong to campaigns with AI review OFF (skipped, no-op)`);
  console.log(
    `  → ${alreadyHumanReviewed} already have a human_verdict on record — AI score fills in for reference only, their status/verdict is left untouched`,
  );
  console.log("");
  console.log("By campaign:");
  for (const r of rows) {
    console.log(`  ${r.aiReview ? "[AI ON] " : "[AI OFF]"} ${r.name}: ${r.count}`);
  }

  if (!execute) {
    console.log("\nDry run only — re-run with --execute to actually score these.");
    return;
  }

  // Low concurrency deliberately: OpenAI fetches each image_url itself, and
  // running many of these at once was overloading Supabase storage enough to
  // trip OpenAI's own download timeout ("Timeout while downloading...") —
  // confirmed by testing the same submissions sequentially vs concurrently.
  const CONCURRENCY = 2;
  console.log(`\nScoring ${willScore} submissions (${CONCURRENCY} at a time)...`);
  const toScore = submissions.filter((s) => campaignById.get(s.campaign_id)?.ai_review);
  let done = 0;
  let threw = 0;
  for (let i = 0; i < toScore.length; i += CONCURRENCY) {
    const batch = toScore.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (s) => {
        try {
          await scoreSubmission(s.id);
        } catch (err) {
          threw += 1;
          console.error(`  threw on submission ${s.id}:`, err);
        }
      }),
    );
    done += batch.length;
    console.log(`  ${done}/${toScore.length} processed (${threw} threw)`);
  }

  // scoreSubmission() never throws on a scoring failure (e.g. a timed-out
  // image download) — it just leaves ai_score null so the submission falls
  // to manual review. Re-query (unfiltered — filtering by up to ~1800
  // individual UUIDs risks the same PostgREST .in() size limit that bit
  // Export earlier) to report the real number still missing, rather than
  // trusting the exception count above.
  const stillMissing = await fetchAllRows((from, to) =>
    admin.from("submissions").select("id").is("ai_score", null).range(from, to),
  );
  const stillNeedsScoring = stillMissing.length - wontScore;
  console.log(
    `\nDone. ${toScore.length - stillNeedsScoring} of ${toScore.length} scored this pass. ` +
      `${stillNeedsScoring} still need scoring (mostly transient image-download timeouts — safe to re-run this script again to pick those up). ` +
      `${wontScore} will always stay unscored (AI review off for their campaign).`,
  );
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
