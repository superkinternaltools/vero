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

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Accepts "2024-01-15" (ISO) and "5 Nov, 2025" / "5 Nov 2025" — the format
 * the store sheet actually exports dates in. */
function dateOrNull(v: string | undefined): string | null {
  const c = (v ?? "").trim().replace(/^"|"$/g, "");
  if (!c) return null;
  let y: number, m: number, d: number;

  const iso = c.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    y = +iso[1]; m = +iso[2]; d = +iso[3];
  } else {
    const dmy = c.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
    if (!dmy) return null;
    const mm = MONTH_NAMES[dmy[2].toLowerCase()];
    if (!mm) return null;
    d = +dmy[1]; m = mm; y = +dmy[3];
  }

  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parseCsv(csv: string): StoreInput[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const at = (name: string) => headers.indexOf(name);
  const ci = at("code"), ni = at("name"), ai = at("aligned");
  const ti = at("store_type"), lati = at("latitude"), lngi = at("longitude");
  const oi = at("opened_at"), cli = at("closed_at");
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
        opened_at: oi >= 0 ? dateOrNull(c[oi]) : null,
        closed_at: cli >= 0 ? dateOrNull(c[cli]) : null,
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
