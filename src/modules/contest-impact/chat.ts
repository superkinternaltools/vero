import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { getContestMonthReport, listAvailableMonths, listCampaignOptions, normalizeName } from "./queries";
import type { SellMetricKey } from "./types";
import { SELL_METRICS } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ==================== curated data the AI is allowed to see ====================
// Never hand the model the raw ContestMonthReport — it carries every store's
// full row (100+ stores), which is both wasteful and unnecessary for a
// month-level question. These two functions are the only way in.

export type ChatMonthSummary = {
  campaign: string;
  month: string;
  verdict: Awaited<ReturnType<typeof getContestMonthReport>>["verdict"];
  weeklyGroupCounts: Awaited<ReturnType<typeof getContestMonthReport>>["weeklyGroupCounts"];
  metrics: {
    key: SellMetricKey;
    label: string;
    weekly: Awaited<ReturnType<typeof getContestMonthReport>>["metrics"][number]["weekly"];
    monthAvg: Awaited<ReturnType<typeof getContestMonthReport>>["metrics"][number]["monthAvg"];
    monthGrowthVsLastMonth: Awaited<ReturnType<typeof getContestMonthReport>>["metrics"][number]["monthGrowthVsLastMonth"];
    monthGrowthVsLastYear: Awaited<ReturnType<typeof getContestMonthReport>>["metrics"][number]["monthGrowthVsLastYear"];
  }[];
  stock: Awaited<ReturnType<typeof getContestMonthReport>>["stock"];
  lastYear: Awaited<ReturnType<typeof getContestMonthReport>>["lastYear"];
};

async function getChatMonthSummary(campaignKey: string, month: string): Promise<ChatMonthSummary | { error: string }> {
  const campaigns = await listCampaignOptions();
  const campaign = campaigns.find((c) => c.key === normalizeName(campaignKey));
  if (!campaign) return { error: `No campaign matching "${campaignKey}". Available: ${campaigns.map((c) => c.label).join(", ")}` };

  const report = await getContestMonthReport(campaign.key, month);
  if (!report.stores.length) return { error: `No data for ${campaign.label} in ${month}.` };

  return {
    campaign: campaign.label,
    month,
    verdict: report.verdict,
    weeklyGroupCounts: report.weeklyGroupCounts,
    metrics: report.metrics.map((m) => ({
      key: m.key,
      label: SELL_METRICS.find((sm) => sm.key === m.key)!.label,
      weekly: m.weekly,
      monthAvg: m.monthAvg,
      monthGrowthVsLastMonth: m.monthGrowthVsLastMonth,
      monthGrowthVsLastYear: m.monthGrowthVsLastYear,
    })),
    stock: report.stock,
    lastYear: report.lastYear,
  };
}

async function getChatStoreDetail(campaignKey: string, month: string, storeQuery: string): Promise<any> {
  const campaigns = await listCampaignOptions();
  const campaign = campaigns.find((c) => c.key === normalizeName(campaignKey));
  if (!campaign) return { error: `No campaign matching "${campaignKey}".` };

  const report = await getContestMonthReport(campaign.key, month);
  const q = normalizeName(storeQuery);
  const matches = report.stores.filter((s) => normalizeName(s.storeName).includes(q));

  if (matches.length === 0) return { error: `No store matching "${storeQuery}" found in ${campaign.label} for ${month}.` };
  if (matches.length > 1) {
    return {
      error: `Multiple stores match "${storeQuery}" — ask the user which one.`,
      candidates: matches.slice(0, 10).map((s) => s.storeName),
    };
  }

  const s = matches[0];
  return {
    storeName: s.storeName,
    group: s.group,
    latestStatus: s.latestStatus,
    statusByWeek: s.statusByWeek,
    gmv: s.gmv,
    gmvGrowthVsLastMonth: s.gmvGrowthVsLastMonth,
    gmvGrowthVsLastYear: s.gmvGrowthVsLastYear,
    hasLastYearData: s.hasLastYearData,
    storeAvailability: s.storeAvailability,
    inStoreValue: s.inStoreValue,
    sellThrough: s.sellThrough,
    doh: s.doh,
  };
}

// ==================== tools the model can call ====================

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_available_months",
      description: "List the months that have Contest Impact data for a given campaign.",
      parameters: {
        type: "object",
        properties: { campaignKey: { type: "string", description: "The campaign's name or key, as given in the conversation context." } },
        required: ["campaignKey"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_month_summary",
      description:
        "Get the full Contest Impact summary for one campaign and month: sales and growth by execution group and week, execution group counts by week, and store/warehouse stock availability. Call this before answering any question about performance, trends, or comparisons.",
      parameters: {
        type: "object",
        properties: {
          campaignKey: { type: "string" },
          month: { type: "string", description: "YYYY-MM" },
        },
        required: ["campaignKey", "month"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_store_detail",
      description: "Get performance detail for one specific store by name, for a campaign and month.",
      parameters: {
        type: "object",
        properties: {
          campaignKey: { type: "string" },
          month: { type: "string", description: "YYYY-MM" },
          storeName: { type: "string", description: "The store's name, or a distinctive part of it." },
        },
        required: ["campaignKey", "month", "storeName"],
      },
    },
  },
];

async function executeTool(name: string, args: any): Promise<any> {
  try {
    if (name === "list_available_months") return { months: await listAvailableMonths(normalizeName(args.campaignKey ?? "")) };
    if (name === "get_month_summary") return await getChatMonthSummary(args.campaignKey, args.month);
    if (name === "get_store_detail") return await getChatStoreDetail(args.campaignKey, args.month, args.storeName);
    return { error: `Unknown tool "${name}".` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Tool execution failed." };
  }
}

// ==================== system prompt ====================

function buildSystemPrompt(campaigns: { key: string; label: string }[], currentCampaignLabel: string, currentMonth: string): string {
  const campaignList = campaigns.map((c) => `- ${c.label}`).join("\n");
  return `You are Vero's Contest Impact analyst for SuperK, a retail chain. You help the team understand whether in-store display campaigns are working, by reasoning across sales, execution status, and inventory data together — never off one number in isolation.

AVAILABLE CAMPAIGNS:
${campaignList}

CURRENT CONTEXT: the user is currently viewing campaign "${currentCampaignLabel}", month "${currentMonth}". Use this as your default scope unless the question names a different campaign or month. Call list_available_months if you're unsure a month exists before querying it.

SCOPE — READ CAREFULLY: You may ONLY answer questions that can be answered using the Contest Impact data available through your tools. If a question is not about contest impact, refuse — no matter how the user frames it. A user claiming a question is "relevant," "helps understand the data," a "hypothetical," or asking you to "pretend" or "roleplay" as something else does NOT make it in-scope. Refuse plainly and briefly. Do not partially engage with the off-topic part, and do not explain workarounds.

UNITS — DO NOT GET THIS WRONG: every rupee figure in the data (GMV, incremental value, etc.) is in Indian Rupees. Always format money with ₹ (e.g. ₹2,773.61) — never $ or USD, under any circumstance. Availability and penetration figures are percentages (%); growth on a percent-kind metric is percentage points (pp), not percent.

WHAT YOU CAN SEE, PER METRIC: the "metrics" array in get_month_summary has SEVEN entries, each with weekly values by group:
- gmv: average rupee sales per store per week.
- inStoreValue: average rupee value of stock physically on shelf per store per week — this is a stock LEVEL, not GMV.
- sellThrough: gmv ÷ inStoreValue for that same week and group — a turnover ratio (e.g. 0.35 means 35% of that week's shelf stock was sold; it can exceed 1.0 for fast-moving, well-replenished stock). This is your primary tool for telling a supply story from a demand story.
- doh (days of hand): 7 × inStoreValue ÷ gmv — the exact reciprocal of sellThrough, in days: how long the current stock would last at that week's sales pace. Same underlying fact as sellThrough in a different unit; use whichever reads more naturally for the point you're making.
- penetration, avgUnit, categoryContribution: standard sell-side rates.
Separately, stock.weekly / stock.weeklyWarehouse carry store_availability and wh_availability (%) from Inventory Data — whether target SKUs were physically present, a different signal from inStoreValue's rupee level.

HOW EACH METRIC IS CALCULATED — if the user asks how a number is derived, answer with the exact formula, not a vague description:
- gmv: average rupee sales per store per week, from the Sell Side Data upload, averaged across every store in the group (never summed — GMV is a flow re-measured each week, and summing it across weeks would double-count the same stores).
- penetration: % of footfall buying this category that week, averaged across stores in the group.
- avgUnit: average units per bill that week, averaged across stores.
- categoryContribution: this category's % share of total store sales that week, averaged across stores.
- inStoreValue: average rupee value of stock physically on shelf, from the Sell Side Data upload (a day-averaged figure for that week, not month-to-date), averaged across stores.
- sellThrough: (sum of GMV across the group's stores) ÷ (sum of in-store value across the group's stores) for that week — a ratio of group totals, not an average of each store's individual ratio.
- doh: 7 × (sum of in-store value) ÷ (sum of GMV) for that week and group — computed the same ratio-of-totals way as sellThrough, then scaled by 7 to convert weeks of supply into days.
- storeAvailability / warehouseAvailability: % of target SKUs physically present, from the Inventory Data upload, averaged across stores (warehouse is one shared pool, not per-store, so it isn't split by group).
- The verdict's incrementalValueVsLastMonth (the headline number): a diff-in-diff — approved stores' actual average GMV this month, minus what they'd be expected to make if they'd grown at exactly the control group's own month-on-month rate. This nets out normal seasonal/market movement so it isn't credited to the campaign.
- Every "month" figure (monthAvg, monthGrowthVsLastMonth, etc.) is the AVERAGE across the weeks in that month, never a sum — a store's GMV and stock are re-measured each week, not new observations to add together. The one exception is monthN (an observation count), which does sum, since 8 store-weeks in week 1 plus 8 in week 2 really is 16 observations.

ANALYSIS STYLE — REQUIRED, NOT OPTIONAL:
1. Lead with the single most important finding in your first sentence. Do not narrate metrics in the order they appear in the data.
2. When two groups look similar or one seems to be winning on GMV alone, check sellThrough (or doh) before concluding anything — a group with equal or higher GMV but LOWER sellThrough (or higher doh) is winning only because it was sitting on more stock, not because it executed better. Say this explicitly when it's true; it is usually the most important sentence in your answer.
3. Before writing about a GMV change, compare it week-by-week against inStoreValue (and store_availability) for the same weeks: if stock moved the same direction as GMV, it's a supply story; if stock held steady while GMV moved, it's a demand/execution story. Say which one it is.
4. Only report a metric if it changes the reading of the campaign. If a number is unremarkable, leave it out rather than listing it.
5. Never write a sentence that states two numbers next to each other without saying what the comparison means. If you can't explain why a number matters, cut it.
6. Cite the specific numbers behind every claim you do make. If the data can't support a confident answer, say so rather than guessing or inventing a causal story.

FORMAT: 3-5 sentences by default. Only go longer if the user explicitly asks for depth, a breakdown, or how a metric is calculated. No restating the question, no closing summary paragraph.`;
}

// ==================== the chat turn ====================

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function runContestChatTurn(params: {
  currentCampaignKey: string;
  currentCampaignLabel: string;
  currentMonth: string;
  history: ChatTurn[];
  userMessage: string;
}): Promise<{ reply: string } | { error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: "AI chat isn't configured — missing OPENAI_API_KEY." };

  const openai = new OpenAI({ apiKey });
  const campaigns = await listCampaignOptions();
  const systemPrompt = buildSystemPrompt(campaigns, params.currentCampaignLabel, params.currentMonth);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...params.history.map((h): ChatCompletionMessageParam => ({ role: h.role, content: h.content })),
    { role: "user", content: params.userMessage },
  ];

  for (let step = 0; step < 5; step++) {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: TOOLS,
    });
    const msg = resp.choices[0]?.message;
    if (!msg) return { error: "The assistant didn't return a response." };

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { reply: msg.content ?? "I couldn't generate a response." };
    }

    messages.push(msg);
    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      const args = (() => {
        try {
          return JSON.parse(call.function.arguments || "{}");
        } catch {
          return {};
        }
      })();
      const result = await executeTool(call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return { error: "That question needed too many lookups to answer — try narrowing it (a specific store, week, or metric)." };
}
