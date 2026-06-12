"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import type { StoreInput, StoreType } from "./types";

type Result = { error?: string };

export async function createStore(values: StoreInput): Promise<Result> {
  if (!values.code.trim() || !values.name.trim())
    return { error: "Code and name are required." };
  const supabase = await createClient();
  const { error } = await supabase.from("stores").insert(values);
  if (error) return { error: error.message };
  revalidatePath("/stores");
  return {};
}

export async function updateStore(id: string, values: StoreInput): Promise<Result> {
  if (!values.code.trim() || !values.name.trim())
    return { error: "Code and name are required." };
  const supabase = await createClient();
  const { error } = await supabase.from("stores").update(values).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/stores");
  return {};
}

export async function deleteStore(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/stores");
  return {};
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

function parseCsv(csv: string): StoreInput[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const at = (name: string) => headers.indexOf(name);
  const ci = at("code"), ni = at("name"), ai = at("aligned");
  const ti = at("store_type"), lati = at("latitude"), lngi = at("longitude");
  const truthy = (v: string | undefined) =>
    ["yes", "true", "1", "aligned", "y"].includes((v ?? "").trim().toLowerCase());

  return lines
    .slice(1)
    .map((line) => {
      const c = line.split(",");
      const t = ti >= 0 ? (c[ti] ?? "").trim().toUpperCase() : "";
      return {
        code: (c[ci] ?? "").trim(),
        name: ni >= 0 ? (c[ni] ?? "").trim() : "",
        aligned: ai >= 0 ? truthy(c[ai]) : false,
        store_type: t === "FOFO" || t === "COCO" ? (t as StoreType) : null,
        latitude: lati >= 0 ? num(c[lati]) : null,
        longitude: lngi >= 0 ? num(c[lngi]) : null,
      };
    })
    .filter((r) => r.code && r.name);
}

export async function bulkUploadStores(
  csv: string,
): Promise<{ error?: string; count?: number }> {
  const rows = parseCsv(csv);
  if (rows.length === 0)
    return {
      error:
        "No valid rows found. Expected a header row: code,name,aligned,store_type,latitude,longitude",
    };
  const supabase = await createClient();
  const { error } = await supabase.from("stores").upsert(rows, { onConflict: "code" });
  if (error) return { error: error.message };
  revalidatePath("/stores");
  return { count: rows.length };
}
