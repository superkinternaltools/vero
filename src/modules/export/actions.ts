"use server";

import { createAdminClient } from "@/core/db/admin";
import { requireAdmin } from "@/core/auth/session";
import type { PhotoExportItem } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Day-of-month chunking — same convention as the rest of Export. */
function weekOfMonth(dateISO: string): number {
  const day = Number(dateISO.slice(8, 10));
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  if (day <= 28) return 4;
  return 5;
}

function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

async function fetchAllRows(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  pageSize = 1000,
): Promise<any[]> {
  const results: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) {
      console.error("[export/photos] query page failed:", error);
      break;
    }
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
  }
  return results;
}

/** Ranks a submission for "which one represents this store-week": a human
 * approval always wins, then a human rejection, then AI-only, then anything
 * else. Ties broken by recency at the call site. */
function rank(sub: any): number {
  if (sub.human_verdict === "approved") return 4;
  if (sub.human_verdict === "rejected") return 3;
  if (sub.ai_verdict) return 2;
  return 1;
}

function verdictLabel(sub: any): string {
  if (sub.payout_tier_label) return sub.payout_tier_label;
  if (sub.human_verdict) return sub.human_verdict;
  if (sub.ai_verdict) return `ai_${sub.ai_verdict}`;
  return "pending";
}

/** Builds the photo manifest for a zip: one photo per store × campaign × week,
 * preferring the approved submission where a store submitted more than once.
 * Photo bytes are fetched in the browser from these URLs — the server only
 * decides which photos belong in the download and what they're called. */
export async function getPhotoManifest(
  months: string[],
  campaignIds: string[],
): Promise<{ items?: PhotoExportItem[]; error?: string }> {
  await requireAdmin();
  if (!months.length) return { error: "Pick at least one month." };
  if (months.length > 2) return { error: "Two months at most per download." };
  if (!campaignIds.length) return { error: "Pick at least one campaign." };

  const admin = createAdminClient();
  const sorted = [...months].sort();
  const start = `${sorted[0]}-01`;
  const end = monthEnd(sorted[sorted.length - 1]);

  const tasks = await fetchAllRows((from, to) =>
    admin
      .from("tasks")
      .select("id, campaign_id, store_id, due_date, stores ( name ), campaigns ( name )")
      .in("campaign_id", campaignIds)
      .gte("due_date", start)
      .lte("due_date", end)
      .order("id")
      .range(from, to),
  );
  if (!tasks.length) return { items: [] };

  const subs = await fetchAllRows((from, to) =>
    admin
      .from("submissions")
      .select("task_id, photos, human_verdict, ai_verdict, payout_tier_label, created_at")
      .in("campaign_id", campaignIds)
      .order("created_at", { ascending: false })
      .range(from, to),
  );

  // Keep the best submission per task — approved beats rejected beats AI-only,
  // most recent wins within the same rank.
  const bestByTask = new Map<string, any>();
  for (const s of subs) {
    if (!s.task_id) continue;
    const current = bestByTask.get(s.task_id);
    if (!current || rank(s) > rank(current)) bestByTask.set(s.task_id, s);
  }

  // The date range above is a coarse pre-filter — if the two months aren't
  // adjacent (June and September, say) it would sweep up the months between,
  // so membership is enforced exactly here.
  const wanted = new Set(sorted);
  const items: PhotoExportItem[] = [];
  for (const t of tasks) {
    if (!wanted.has((t.due_date as string).slice(0, 7))) continue;
    const sub = bestByTask.get(t.id);
    const photos: string[] = sub?.photos ?? [];
    if (!photos.length) continue;
    photos.forEach((url, i) => {
      items.push({
        storeName: t.stores?.name ?? "Unknown store",
        campaignName: t.campaigns?.name ?? "Unknown campaign",
        month: (t.due_date as string).slice(0, 7),
        week: weekOfMonth(t.due_date),
        verdict: verdictLabel(sub),
        url,
        photoIndex: i + 1,
        photoCount: photos.length,
      });
    });
  }

  items.sort(
    (a, b) =>
      a.storeName.localeCompare(b.storeName) ||
      a.campaignName.localeCompare(b.campaignName) ||
      a.week - b.week ||
      a.photoIndex - b.photoIndex,
  );
  return { items };
}
