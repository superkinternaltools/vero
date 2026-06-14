"use server";

import { getAccess } from "@/core/auth/access";
import { createClient } from "@/core/db/server";
import { runAiScoring, type AiResult } from "./engine";

/** Runs the real AI pipeline against a sample photo using unsaved form values —
 *  so admins can test a rubric while creating/editing a campaign. */
type Tier = { label: string; min_score: number; max_score: number; pct: number };
export type TestAiResult = AiResult & { tierLabel?: string };

export async function testAiPrompt(input: {
  referenceImages: string[];
  testPhotos: string[];
  instructions: string;
  rubric: string;
  strictness: string;
  passThreshold: number;
  payoutModel?: string;
  payoutTiers?: Tier[];
}): Promise<{ result?: TestAiResult; error?: string }> {
  const access = await getAccess();
  if (!access?.allowed.includes("campaigns")) return { error: "Not authorized." };
  if (input.testPhotos.length === 0) return { error: "Upload a test photo first." };

  try {
    const supabase = await createClient();
    const { data: sysRow } = await supabase
      .from("app_settings").select("value").eq("key", "ai_system_instruction").maybeSingle();
    const result = await runAiScoring({
      referenceImages: input.referenceImages,
      photos: input.testPhotos,
      instructions: input.instructions || null,
      rubric: input.rubric || null,
      strictness: input.strictness,
      passThreshold: input.passThreshold,
      systemInstruction: (sysRow as any)?.value ?? undefined,
    });
    if (!result)
      return { error: "AI is not configured (missing API key) or returned an unreadable answer." };

    // For tiered campaigns map the score to the matching tier label
    let tierLabel: string | undefined;
    if (input.payoutModel === "tiered" && input.payoutTiers?.length) {
      for (const t of input.payoutTiers) {
        if (result.score >= t.min_score && result.score <= t.max_score) {
          tierLabel = t.label;
          break;
        }
      }
    }

    return { result: { ...result, tierLabel } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI test failed." };
  }
}
