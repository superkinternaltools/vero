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
