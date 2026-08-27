"use server";

import { getAccess } from "@/core/auth/access";
import { runCampaignBotTurn, type BotTurn } from "./bot";
import type { DraftCampaignInput } from "./types";

export async function sendCampaignBotMessage(
  history: BotTurn[],
  userMessage: string,
  stagedNames: string[],
): Promise<{ reply?: string; newDrafts?: DraftCampaignInput[]; error?: string }> {
  const access = await getAccess();
  if (!access?.allowed.includes("campaigns")) return { error: "Not authorized." };
  if (!userMessage.trim()) return { error: "Message is empty." };

  const result = await runCampaignBotTurn({ history, userMessage, stagedNames });
  if ("error" in result) return { error: result.error };
  return { reply: result.reply, newDrafts: result.newDrafts };
}
