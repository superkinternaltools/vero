"use server";

import { getAccess } from "@/core/auth/access";
import { runAiScoring, type AiResult } from "./engine";

/** Runs the real AI pipeline against a sample photo using unsaved form values —
 *  so admins can test a rubric while creating/editing a campaign. */
export async function testAiPrompt(input: {
  referenceImages: string[];
  testPhotos: string[];
  instructions: string;
  rubric: string;
  strictness: string;
  passThreshold: number;
}): Promise<{ result?: AiResult; error?: string }> {
  const access = await getAccess();
  if (!access?.allowed.includes("campaigns")) return { error: "Not authorized." };
  if (input.testPhotos.length === 0) return { error: "Upload a test photo first." };

  try {
    const result = await runAiScoring({
      referenceImages: input.referenceImages,
      photos: input.testPhotos,
      instructions: input.instructions || null,
      rubric: input.rubric || null,
      strictness: input.strictness,
      passThreshold: input.passThreshold,
    });
    if (!result)
      return { error: "AI is not configured (missing API key) or returned an unreadable answer." };
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI test failed." };
  }
}
