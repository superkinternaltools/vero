"use server";

import { createClient } from "@/core/db/server";

type Result = { error?: string };

export async function closeGeofenceFlag(submissionId: string): Promise<Result> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  if (!profile?.is_admin) return { error: "Not authorised." };

  const { error } = await supabase
    .from("submissions")
    .update({ geofence_flag: false })
    .eq("id", submissionId);
  return error ? { error: error.message } : {};
}

export async function closeDuplicateFlag(submissionId: string): Promise<Result> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  if (!profile?.is_admin) return { error: "Not authorised." };

  const { error } = await supabase
    .from("submissions")
    .update({ duplicate_flag: false })
    .eq("id", submissionId);
  return error ? { error: error.message } : {};
}
