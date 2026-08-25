import OpenAI from "openai";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AiScoringParams = {
  referenceImages: string[];
  photos: string[];
  instructions: string | null;
  rubric: string | null;
  strictness: string;
  passThreshold: number;
  systemInstruction?: string;
};

export type AiResult = {
  score: number;
  verdict: "approved" | "rejected";
  assessment: string;
};

/**
 * The single AI scoring engine — used by both real submissions and the
 * campaign-form prompt tester, so a test always behaves exactly like production.
 * Returns null when no API key is configured or the response can't be parsed.
 */
export async function runAiScoring(params: AiScoringParams): Promise<AiResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const openai = new OpenAI({ apiKey });

  const content: any[] = [
    {
      type: "text",
      text:
        `Strictness: ${params.strictness}. Pass threshold: ${params.passThreshold}/10.\n` +
        `Execution instructions: ${params.instructions ?? "—"}\n` +
        `Brand scoring rubric: ${params.rubric ?? "—"}\n` +
        `The REFERENCE image(s) appear first, then the STORE's submitted photo(s). ` +
        `Judge how well the submission matches the reference and rubric.`,
    },
  ];
  for (const url of params.referenceImages) content.push({ type: "image_url", image_url: { url } });
  for (const url of params.photos) content.push({ type: "image_url", image_url: { url } });

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: params.systemInstruction ??
          'You are a retail execution auditor for SuperK. Respond ONLY with JSON: ' +
          '{"score": <number 0-10>, "assessment": [<3-5 short bullet strings>]}.',
      },
      { role: "user", content },
    ],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
  const score = Number(parsed.score);
  if (!Number.isFinite(score)) return null;

  return {
    score,
    verdict: score >= params.passThreshold ? "approved" : "rejected",
    assessment: Array.isArray(parsed.assessment)
      ? parsed.assessment.join("\n")
      : String(parsed.assessment ?? ""),
  };
}

export type RubricSku = { name: string; qty: number; facings: number; shelf_number: string };

/** JSON-mode generation sometimes writes a literal backslash-n instead of an
 * actual line break inside the string value — a known model quirk, not
 * something prompting alone reliably prevents. Normalize it deterministically. */
function fixLiteralNewlines(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

const RUBRIC_SYSTEM_PROMPT = `You write Brand Scoring Rubrics for Vero, a retail execution-proof platform. \
A rubric is the main instruction an AI vision auditor uses to score a field photo 0-10 against a reference \
image, so it must be self-contained, unambiguous, and usable without any other context.

Below is one worked example showing the STYLE and STRUCTURE to follow — a progressive degradation ladder, \
not the content to copy. Never reuse its brand, SKU names, or specific numbers; generate fresh content \
tailored to the campaign actually given to you.

---EXAMPLE (style reference only — [N] and [M] stand for whatever counts THIS campaign actually gives you,
never a fixed number; a different campaign had a different SKU count and shelf count here)---
The campaign context is Surf Excel (HUL Jun), which has a total of [N] target SKUs to be merchandised on an \
end cap rack across [M] shelves. Here is the planogram reference detailing the SKU name and total quantity. \
The required items are Surf Excel Matic Liquid Top Load Bottle 1L with 4 quantity, Surf Excel Matic Liquid \
Top Load Pouch 4L with 6 quantity, Surf Excel Matic Front Load Liquid Bottle 1L with 6 quantity, Surf Excel \
Top Load Matic Powder 1Kg with 6 quantity, Surf Excel Matic Liquid Front Load Pouch 4L with 4 quantity, Surf \
Excel Top Load Matic Liquid 500ml with 6 quantity, Surf Excel Matic Liquid Top Load 2L with 6 quantity, Surf \
Excel Matic Front Load 1Kg with 6 quantity, Surf Excel Front Load Matic Liquid 500ml with 6 quantity, and \
Surf Excel Front Load Matic Liquid 2L with 6 quantity. Assess the execution progressively to determine the \
final score. Award a perfect 10 only if all [N] SKUs are present as per the reference image, all [M] shelves \
are full without holes, and price tags are present for all SKUs. If it is not a perfect 10, find the \
highest applicable condition for the degradation logic. Give a score of 9 if price tags are present for 50 \
percent of the SKUs. Give a score of 8 if all [M] shelves are full without holes. Give a score of 7 if 90 \
percent or more products are present as per the reference image. Give a score of 6 if 80 to less than 90 \
percent of products are present as per the reference image. Give a score of 5 if 60 to less than 80 percent \
of products are present as per the reference image. Give a score of 4 if 50 percent to less than 60 percent \
of products are present as per the reference image. Give a score between 1 and 3 if less than 50 percent of \
products exist on the rack. Give a score of 0 for an empty rack or completely wrong category. In your \
assessment array, provide brief statements justifying your score by mentioning specific missing SKUs, \
missing price tags, or shelves with holes to explain the deductions.
---END EXAMPLE---

What to generalize, not copy:
- State the campaign/brand and execution type up front, using what was actually given.
- If a SKU list was given, enumerate it by name and target quantity so the rubric is self-contained — a
  reader shouldn't need to look anywhere else. Use the real facings/shelf numbers given to set the "full
  shelves" or "correct facings" condition instead of assuming a shelf count.
- If NO SKU list was given, drop all SKU-counting and shelf-hole logic entirely and build the ladder around
  what execution type implies instead (e.g. presence of the display itself, product facing/arrangement,
  branding/signage visible, cleanliness, price tags) — never invent SKU names or counts that weren't given.
- Keep the "highest applicable condition wins" progressive-degradation instruction — one clear ladder from
  10 down to 0, each rung a concrete, visually-checkable condition (not vague language like "good execution").
- Always end with an instruction to justify the score in the assessment by citing specific missing items,
  not just restating the number.

CRITICAL — the example's numbers are NOT yours: it has 10 SKUs and 5 shelves; your campaign almost
certainly has a different count. Before writing anything, count the actual SKU list given to you (or note
that none was given) and use THAT number everywhere — never write "10 SKUs" or "5 shelves" unless the given
list actually has exactly that many. Re-check your draft for any number carried over from the example before
answering.

If the user message includes an "Authoritative score ladder" section, the ops team has already decided the
exact score bands and the condition for each — this OVERRIDES the example's degradation pattern entirely.
Use those exact score ranges and labels, in that order, unchanged. Your job is only to turn each given
condition into a complete, self-contained rubric sentence using the REAL SKU names/quantities/shelf numbers
given elsewhere in the message (e.g. turn "4 or more products present" into a sentence naming which of the
actual SKUs). Do not add, remove, reorder, or renumber tiers, and do not invent a different percent-based
ladder when one was already given.

Respond ONLY with JSON: {"rubric": "<the full rubric as plain prose, ready to paste into a form field>"}.`;

export type RubricTier = { label: string; min_score: number; max_score: number; scoring_prompt?: string };

/**
 * Generates a Brand Scoring Rubric from a campaign's execution type + tracked
 * SKUs — an admin-triggered draft, always reviewed/edited before saving, not
 * used to decide anything on its own. When payoutTiers carry a scoring_prompt
 * (pasted from the ops team's own tier sheet), that ladder is authoritative —
 * the model enriches it with real SKU detail rather than inventing its own.
 */
export async function generateScoringRubric(params: {
  campaignName: string;
  executionTypeName: string | null;
  skus: RubricSku[];
  payoutTiers?: RubricTier[];
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const openai = new OpenAI({ apiKey });

  const skuLines = params.skus.filter((s) => s.name.trim()).length
    ? params.skus
        .filter((s) => s.name.trim())
        .map(
          (s, i) =>
            `${i + 1}. ${s.name} — qty ${s.qty}${s.facings ? `, ${s.facings} facing(s)` : ""}${s.shelf_number ? `, shelf #${s.shelf_number}` : ""}`,
        )
        .join("\n")
    : null;

  const tiersWithPrompt = (params.payoutTiers ?? []).filter((t) => t.scoring_prompt?.trim());
  const tierLines = tiersWithPrompt.length
    ? [...tiersWithPrompt].sort((a, b) => b.min_score - a.min_score)
        .map((t) => `- ${t.label || "(unlabeled)"} (${t.min_score}-${t.max_score}): ${t.scoring_prompt}`)
        .join("\n")
    : null;

  const userPrompt = [
    `Campaign: ${params.campaignName || "(untitled)"}`,
    `Execution type: ${params.executionTypeName ?? "not specified"}`,
    skuLines
      ? `Target SKUs (the planogram to merchandise):\n${skuLines}`
      : "No SKU list was provided for this campaign — build the rubric around the execution type alone.",
    tierLines
      ? `Authoritative score ladder (already defined — use these exact ranges/labels, do not invent your own):\n${tierLines}`
      : null,
  ].filter((s): s is string => s !== null).join("\n\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: RUBRIC_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
  const rubric = typeof parsed.rubric === "string" ? fixLiteralNewlines(parsed.rubric.trim()) : "";
  return rubric || null;
}

const INSTRUCTIONS_SYSTEM_PROMPT = `You write Execution Instructions for Vero, a retail execution-proof platform. \
This is the field-facing checklist a store employee reads before merchandising a display and photographing it — \
plain, concrete, and directly actionable, not analytical like a scoring rubric.

Below is one worked example showing the STYLE and STRUCTURE to follow — two parts, merchandising steps then \
photo-capture steps — not the content to copy. Never reuse its brand, SKU count, or shelf count; generate \
fresh content tailored to the campaign actually given to you.

---EXAMPLE (style reference only — [N] and [M] stand for whatever counts THIS campaign actually gives you,
never a fixed number; a different campaign had a different SKU count and shelf count here)---
Ensure all [N] specific Surf Excel SKUs are present on the end cap rack.
Place each product strictly according to the reference image across the [M] shelves and maintain the required quantities and facings.
Pull products forward to ensure there are no gaps or empty spaces. All [M] shelves must look completely full.
Every single SKU on the rack must have a visible and correctly placed price tag.
Take a straight-on, clear, and well-lit photo of the entire end cap setup.
Ensure all [M] shelves, from top to bottom, are fully visible within the frame.
Ensure the photo is sharp enough that the AI can detect product facings and price tags.
---END EXAMPLE---

What to generalize, not copy:
- Open with what to merchandise: name the execution type and, if SKUs were given, the exact count and that
  they must match the reference image/planogram, including quantities and facings actually given.
- If a SKU list was given, use the real shelf numbers given to describe the layout instead of assuming a
  shelf count; if none were given, describe the display generically (no fabricated SKU/shelf counts).
- Include a "no gaps, pulled forward, fully stocked" instruction and a price-tag instruction — these apply
  regardless of execution type.
- Close with concrete photo-capture guidance: angle, lighting, full display in frame, sharp enough for the
  AI to verify facings/price tags. Keep this part short and always present.
- One short instruction per line. No headers, no numbering, no marketing language — this is read quickly by
  a field employee standing in front of the display.

CRITICAL — the example's numbers are NOT yours: it has 10 SKUs and 5 shelves; your campaign almost
certainly has a different count. Before writing anything, count the actual SKU list given to you (or note
that none was given) and use THAT number everywhere — never write "10 SKUs" or "5 shelves" unless the given
list actually has exactly that many. Re-check your draft for any number carried over from the example before
answering.

Respond ONLY with JSON: {"instructions": "<the full instructions as plain text, one instruction per line>"}.`;

/**
 * Generates Execution Instructions from a campaign's execution type + tracked
 * SKUs — an admin-triggered draft, always reviewed/edited before saving.
 */
export async function generateExecutionInstructions(params: {
  campaignName: string;
  executionTypeName: string | null;
  skus: RubricSku[];
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const openai = new OpenAI({ apiKey });

  const skuLines = params.skus.filter((s) => s.name.trim()).length
    ? params.skus
        .filter((s) => s.name.trim())
        .map(
          (s, i) =>
            `${i + 1}. ${s.name} — qty ${s.qty}${s.facings ? `, ${s.facings} facing(s)` : ""}${s.shelf_number ? `, shelf #${s.shelf_number}` : ""}`,
        )
        .join("\n")
    : null;

  const userPrompt = [
    `Campaign: ${params.campaignName || "(untitled)"}`,
    `Execution type: ${params.executionTypeName ?? "not specified"}`,
    skuLines
      ? `Target SKUs (the planogram to merchandise):\n${skuLines}`
      : "No SKU list was provided for this campaign — describe the display generically.",
  ].join("\n\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: INSTRUCTIONS_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
  const instructions = typeof parsed.instructions === "string" ? fixLiteralNewlines(parsed.instructions.trim()) : "";
  return instructions || null;
}
