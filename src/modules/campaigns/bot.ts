import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import {
  listDepartments,
  listJobTitles,
  listExecutionTypes,
  listCampaignCategories,
  listPayoutModels,
  listBrands,
} from "@/modules/org/queries";
import { listStores } from "@/modules/stores/queries";
import { getCampaign, listCampaignsByBrand } from "./queries";
import { EMPTY_CAMPAIGN } from "./types";
import type { DraftCampaignInput, PayoutTier, CampaignSku } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ==================== read-only lookup tools ====================
// None of these ever write to the database — they only let the model see
// what options exist so it can build a valid draft, and see past campaigns
// so it can clone one.

async function listBrandOptions() {
  const brands = await listBrands();
  return brands.map((b) => ({ id: b.id, name: b.name }));
}

async function resolveBrandId(brandName: string): Promise<{ id: string; name: string } | null> {
  const brands = await listBrandOptions();
  const q = brandName.trim().toLowerCase();
  return brands.find((b) => b.name.toLowerCase() === q) ?? brands.find((b) => b.name.toLowerCase().includes(q)) ?? null;
}

async function toolListBrandCampaignHistory(brandName: string) {
  const brand = await resolveBrandId(brandName);
  if (!brand) return { error: `No brand matching "${brandName}". Call list_brands first.` };
  const campaigns = await listCampaignsByBrand(brand.id);
  return { brand: brand.name, campaigns };
}

async function toolGetPastCampaign(brandName: string, monthLabel: string) {
  const brand = await resolveBrandId(brandName);
  if (!brand) return { error: `No brand matching "${brandName}". Call list_brands first.` };
  const campaigns = await listCampaignsByBrand(brand.id);
  if (!campaigns.length) return { error: `"${brand.name}" has no past campaigns to clone from.` };

  const q = monthLabel.trim().toLowerCase();
  const matches = q ? campaigns.filter((c) => c.name.toLowerCase().includes(q)) : campaigns;

  if (matches.length === 0) {
    return {
      error: `No "${brand.name}" campaign matching "${monthLabel}". Here's the brand's full history — pick the closest one or ask the user.`,
      campaigns,
    };
  }
  if (matches.length > 1) {
    return {
      error: `Multiple "${brand.name}" campaigns match "${monthLabel}" — ask the user which one, or use distinguishing detail (execution type, store count).`,
      candidates: matches,
    };
  }

  const full = await getCampaign(matches[0].id);
  if (!full) return { error: "That campaign could not be loaded." };
  const { id, reference_images, ...draft } = full;
  void id;
  void reference_images;
  return { source: matches[0], draft };
}

// ==================== tools the model can call ====================

const TOOLS: ChatCompletionTool[] = [
  { type: "function", function: { name: "list_brands", description: "List all brands (e.g. Tide, Ariel, Surf Excel).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_execution_types", description: "List valid execution types (e.g. End Cap, Floor Stack).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_departments", description: "List departments a campaign can target.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_job_titles", description: "List job titles a campaign can target.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_categories", description: "List campaign categories (e.g. Brand Visibility, Marketing).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_payout_models", description: "List valid payout models (e.g. binary, tiered).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_stores", description: "List stores (id, code, name only).", parameters: { type: "object", properties: {} } } },
  {
    type: "function",
    function: {
      name: "list_brand_campaign_history",
      description: "List every past campaign for a brand (name, dates, status) — use to answer 'what have we run for Tide' or to find a specific month to clone.",
      parameters: { type: "object", properties: { brandName: { type: "string" } }, required: ["brandName"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_past_campaign",
      description: "Get a specific past campaign's full configuration to use as a clone starting point. If the month is ambiguous or matches more than one campaign, this returns candidates instead — ask the user to disambiguate rather than guessing.",
      parameters: {
        type: "object",
        properties: {
          brandName: { type: "string" },
          monthLabel: { type: "string", description: "Free text naming the month/period, e.g. \"September\" or \"last month\" — matched against campaign names." },
        },
        required: ["brandName", "monthLabel"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_drafts",
      description:
        "Stage one or more campaign drafts for the human to review. This does NOT create anything — drafts only become real campaigns when the user reviews the cards this returns and clicks Create. Always call this once you have enough information for at least one complete draft, rather than describing the campaign in prose.",
      parameters: {
        type: "object",
        properties: {
          drafts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                brand_id: { type: "string", description: "id from list_brands" },
                category_id: { type: "string", description: "id from list_categories" },
                execution_type_id: { type: "string", description: "id from list_execution_types" },
                frequency: { type: "string", enum: ["daily", "weekly", "monthly"] },
                start_date: { type: "string", description: "YYYY-MM-DD" },
                end_date: { type: "string", description: "YYYY-MM-DD" },
                instructions: { type: "string" },
                departmentIds: { type: "array", items: { type: "string" } },
                storeIds: { type: "array", items: { type: "string" }, description: "Only fill when cloning — copy verbatim from the source campaign. For a genuinely new campaign, leave empty and let the human pick stores on the card." },
                jobTitleIds: { type: "array", items: { type: "string" } },
                payout_enabled: { type: "boolean" },
                payout_amount: { type: "number" },
                payout_model: { type: "string" },
                payout_tiers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      min_score: { type: "number" },
                      max_score: { type: "number" },
                      pct: { type: "number" },
                      scoring_prompt: { type: "string" },
                    },
                  },
                },
                scoring_rubric: { type: "string" },
                skus: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      qty: { type: "number" },
                      facings: { type: "number" },
                      shelf_number: { type: "string" },
                    },
                  },
                },
              },
              required: ["name"],
            },
          },
        },
        required: ["drafts"],
      },
    },
  },
];

async function executeTool(name: string, args: any): Promise<any> {
  try {
    if (name === "list_brands") return { brands: await listBrandOptions() };
    if (name === "list_execution_types") return { execution_types: await listExecutionTypes() };
    if (name === "list_departments") return { departments: await listDepartments() };
    if (name === "list_job_titles") return { job_titles: await listJobTitles() };
    if (name === "list_categories") return { categories: await listCampaignCategories() };
    if (name === "list_payout_models") return { payout_models: await listPayoutModels() };
    if (name === "list_stores") {
      const stores = await listStores();
      return { stores: stores.map((s) => ({ id: s.id, code: s.code, name: s.name })) };
    }
    if (name === "list_brand_campaign_history") return toolListBrandCampaignHistory(args.brandName ?? "");
    if (name === "get_past_campaign") return toolGetPastCampaign(args.brandName ?? "", args.monthLabel ?? "");
    if (name === "propose_drafts") {
      const drafts = Array.isArray(args.drafts) ? args.drafts.map(normalizeDraft) : [];
      return { drafts };
    }
    return { error: `Unknown tool "${name}".` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Tool execution failed." };
  }
}

// ==================== draft normalization ====================
// propose_drafts is a pure function — it never touches the database. It
// only fills EMPTY_CAMPAIGN defaults for anything missing/invalid and
// forces status to "draft" so a proposed draft can never come in
// pre-activated (which would trigger task generation before a human has
// reviewed anything).

function normalizeTier(raw: any): PayoutTier {
  return {
    label: typeof raw?.label === "string" ? raw.label : "",
    min_score: Number.isFinite(raw?.min_score) ? raw.min_score : 0,
    max_score: Number.isFinite(raw?.max_score) ? raw.max_score : 10,
    pct: Number.isFinite(raw?.pct) ? raw.pct : 0,
    scoring_prompt: typeof raw?.scoring_prompt === "string" ? raw.scoring_prompt : undefined,
  };
}

function normalizeSku(raw: any): CampaignSku {
  return {
    name: typeof raw?.name === "string" ? raw.name : "",
    qty: Number.isFinite(raw?.qty) ? raw.qty : 0,
    facings: Number.isFinite(raw?.facings) ? raw.facings : 0,
    shelf_number: typeof raw?.shelf_number === "string" ? raw.shelf_number : "",
  };
}

const FREQUENCIES = ["daily", "weekly", "monthly"];
const STRICTNESS = ["low", "medium", "high"];
const SCORE_MODES = ["reviewer_preferred", "ai_preferred", "ai_auto_approve"];
const CAPTURE_MODES = ["camera", "gallery"];

function normalizeDraft(raw: any): DraftCampaignInput {
  return {
    name: typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : "Untitled campaign",
    execution_type_id: typeof raw?.execution_type_id === "string" ? raw.execution_type_id : null,
    frequency: FREQUENCIES.includes(raw?.frequency) ? raw.frequency : EMPTY_CAMPAIGN.frequency,
    status: "draft",
    start_date: typeof raw?.start_date === "string" ? raw.start_date : null,
    end_date: typeof raw?.end_date === "string" ? raw.end_date : null,
    instructions: typeof raw?.instructions === "string" ? raw.instructions : "",
    departmentIds: Array.isArray(raw?.departmentIds) ? raw.departmentIds.filter((x: any) => typeof x === "string") : [],
    storeIds: Array.isArray(raw?.storeIds) ? raw.storeIds.filter((x: any) => typeof x === "string") : [],
    jobTitleIds: Array.isArray(raw?.jobTitleIds) ? raw.jobTitleIds.filter((x: any) => typeof x === "string") : [],
    payout_enabled: !!raw?.payout_enabled,
    payout_amount: Number.isFinite(raw?.payout_amount) ? raw.payout_amount : 0,
    payout_model: typeof raw?.payout_model === "string" ? raw.payout_model : EMPTY_CAMPAIGN.payout_model,
    payout_tiers: Array.isArray(raw?.payout_tiers) ? raw.payout_tiers.map(normalizeTier) : [],
    ai_review: raw?.ai_review !== undefined ? !!raw.ai_review : EMPTY_CAMPAIGN.ai_review,
    ai_strictness: STRICTNESS.includes(raw?.ai_strictness) ? raw.ai_strictness : EMPTY_CAMPAIGN.ai_strictness,
    pass_threshold: Number.isFinite(raw?.pass_threshold) ? raw.pass_threshold : EMPTY_CAMPAIGN.pass_threshold,
    score_mode: SCORE_MODES.includes(raw?.score_mode) ? raw.score_mode : EMPTY_CAMPAIGN.score_mode,
    ai_score_visible: raw?.ai_score_visible !== undefined ? !!raw.ai_score_visible : EMPTY_CAMPAIGN.ai_score_visible,
    scoring_rubric: typeof raw?.scoring_rubric === "string" ? raw.scoring_rubric : "",
    capture_mode: CAPTURE_MODES.includes(raw?.capture_mode) ? raw.capture_mode : EMPTY_CAMPAIGN.capture_mode,
    num_photos: Number.isFinite(raw?.num_photos) && raw.num_photos > 0 ? raw.num_photos : 1,
    skip_dates: Array.isArray(raw?.skip_dates) ? raw.skip_dates.filter((x: any) => typeof x === "string") : [],
    category_id: typeof raw?.category_id === "string" ? raw.category_id : null,
    skus: Array.isArray(raw?.skus) ? raw.skus.map(normalizeSku) : [],
    brand_id: typeof raw?.brand_id === "string" ? raw.brand_id : null,
  };
}

// ==================== system prompt ====================

function buildSystemPrompt(stagedNames: string[]): string {
  const stagedNote = stagedNames.length
    ? `\n\nALREADY STAGED IN THIS CONVERSATION (visible to the user as cards right now — do NOT include any of these names in propose_drafts again unless the user explicitly asks to change one, and if they do, re-fetch its full data with get_past_campaign or restate every field you already know rather than a partial guess): ${stagedNames.map((n) => `"${n}"`).join(", ")}.`
    : "";
  return `You are Vero's campaign-creation assistant for SuperK, a retail chain. You help the ops team set up in-store execution campaigns quickly — either by cloning a past brand campaign and adjusting it for a new period, or by building a genuinely new campaign from a plain-language description. The team's real pain is creating many campaigns (a dozen or more) in one sitting without repeatedly walking the full manual form.

HARD RULE — YOU NEVER CREATE CAMPAIGNS: propose_drafts only stages drafts for human review. Nothing is saved to Vero until the user reviews the resulting cards and clicks "Create". Never say you "created" or "set up" a campaign — say you've "drafted" or "staged" it for review.

WORKFLOW:
1. To clone a past campaign: call list_brands (if you don't already know the brand's id), then list_brand_campaign_history or get_past_campaign to find the source campaign. get_past_campaign returns candidates instead of a single match when the month is ambiguous — ask the user to pick rather than guessing.
2. To build a new campaign: gather what's needed through conversation (name/brand, execution type, frequency, dates, targeting, payout, SKUs if it's a Brand Visibility campaign) — look up valid ids via list_execution_types/list_departments/list_job_titles/list_categories/list_payout_models/list_stores rather than inventing them. Reasonable defaults matter: if the user doesn't specify AI review settings or payout, leave those as sensible platform defaults rather than asking about everything.
3. Call propose_drafts as soon as you have at least one complete draft — don't wait to batch everything into one giant call. The user can ask for more drafts in the same conversation; each call adds to what's already staged, nothing is replaced. When a turn is about a NEW campaign, only include that new campaign in propose_drafts — never pad the call with a draft you already staged in an earlier turn just to "confirm" it's still there.
4. STORE TARGETING: when cloning, copy storeIds verbatim from the source campaign (get_past_campaign gives you this). For a genuinely new campaign, leave storeIds empty rather than guessing which stores match a fuzzy description like "our usual stores" — the human fills targeting in on the draft card, where it's easy to pick from a real list.
5. If a request is ambiguous (which brand, which month, which of several same-month campaigns), ask a clarifying question in your reply instead of guessing — a wrong guess costs the user more time than a quick question.
6. Each draft's fields describe only that one campaign. Don't carry over brand_id, category_id, execution_type_id, or any other field from a different campaign you're staging or discussed earlier in this conversation, unless the user's request actually implies they should be shared (e.g. "another Tide campaign" clearly means the same brand — a generic new campaign with no stated brand does not).

Keep replies short — a sentence or two confirming what you've staged or asking what's still needed. The draft cards themselves show the details; don't restate them in prose.${stagedNote}`;
}

// ==================== the bot turn ====================

export type BotTurn = { role: "user" | "assistant"; content: string };

export async function runCampaignBotTurn(params: {
  history: BotTurn[];
  userMessage: string;
  stagedNames: string[];
}): Promise<{ reply: string; newDrafts: DraftCampaignInput[] } | { error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: "The campaign bot isn't configured — missing OPENAI_API_KEY." };

  const openai = new OpenAI({ apiKey });
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(params.stagedNames) },
    ...params.history.map((h): ChatCompletionMessageParam => ({ role: h.role, content: h.content })),
    { role: "user", content: params.userMessage },
  ];

  const newDrafts: DraftCampaignInput[] = [];

  for (let step = 0; step < 5; step++) {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: TOOLS,
    });
    const msg = resp.choices[0]?.message;
    if (!msg) return { error: "The assistant didn't return a response." };

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { reply: msg.content ?? "I couldn't generate a response.", newDrafts };
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
      if (call.function.name === "propose_drafts" && Array.isArray(result?.drafts)) {
        newDrafts.push(...result.drafts);
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return { error: "That request needed too many steps — try breaking it into smaller asks (one brand/period at a time)." };
}
