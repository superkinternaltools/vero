"use client";

import { useState, useTransition, type ReactNode, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { X, ImagePlus, FlaskConical, PlusCircle, Trash2, Sparkles, ClipboardPaste } from "lucide-react";
import { Input } from "@/core/ui/input";
import { Button } from "@/core/ui/button";
import { MultiSelect } from "@/core/ui/multi-select";
import { createClient } from "@/core/db/client";
import { testAiPrompt, generateRubric, generateInstructions } from "@/modules/ai-review/actions";
import { StorePicker } from "./store-picker";
import type { TestAiResult } from "@/modules/ai-review/actions";
import { cn } from "@/core/lib/utils";
import type {
  CampaignFormValues,
  Frequency,
  CampaignStatus,
  ScoreMode,
  AIStrictness,
  CaptureMode,
  PayoutTier,
  CampaignSku,
} from "../types";
import { createCampaign, updateCampaign } from "../actions";

type Opt = { id: string; name: string };
type StoreOpt = { id: string; label: string; name: string; closed: boolean };

const selectClass =
  "w-full rounded-xl border border-transparent bg-input px-4 py-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "block text-sm font-medium text-foreground";
const textareaClass = selectClass + " min-h-24 resize-y";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--primary)]"
      />
      <span>
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

const SKIP_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
/** Accepts tab-separated (pasted from Excel/Sheets) or comma-separated
 * (CSV) rows of "name, qty, facings, shelf #" — one SKU per line. Skips a
 * header row when present (heuristic: qty column isn't a plain number). */
function parseSkuPaste(text: string): CampaignSku[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((line) =>
    (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim()),
  );
  const looksLikeHeader = rows.length > 0 && rows[0].length > 1 && !/^\d+$/.test(rows[0][1] ?? "");
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  return dataRows
    .filter((c) => c[0])
    .map((c) => ({
      name: c[0] ?? "",
      qty: Number(c[1]) || 0,
      facings: Number(c[2]) || 0,
      shelf_number: c[3] ?? "",
    }));
}

/** Header-matched (not positional) so column order from a pasted Excel
 * sheet doesn't matter — looks for columns containing "label", "score"
 * (the min-max range, e.g. "5-6" or a single "4"), "payout", and a per-tier
 * "prompt" (the condition text — kept, since it feeds rubric generation).
 * Any other column (e.g. an approval-threshold column) is ignored. */
function parseTierPaste(text: string): PayoutTier[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const rows = lines.map((line) =>
    (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim()),
  );
  const header = rows[0].map((h) => h.toLowerCase());
  const idxLabel = header.findIndex((h) => h.includes("label"));
  const idxScore = header.findIndex((h) => h.includes("score") && !h.includes("threshold") && !h.includes("prompt"));
  const idxPayout = header.findIndex((h) => h.includes("payout"));
  const idxPrompt = header.findIndex((h) => h.includes("prompt"));
  if (idxLabel < 0 || idxScore < 0 || idxPayout < 0) return [];

  return rows
    .slice(1)
    .filter((r) => r[idxLabel])
    .map((r) => {
      const range = r[idxScore] ?? "";
      const rangeMatch = range.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
      const single = range.match(/^(\d+(?:\.\d+)?)$/);
      const min = rangeMatch ? Number(rangeMatch[1]) : single ? Number(single[1]) : 0;
      const max = rangeMatch ? Number(rangeMatch[2]) : single ? Number(single[1]) : 10;
      const pct = Number((r[idxPayout] ?? "0").replace("%", "").trim()) || 0;
      const scoring_prompt = idxPrompt >= 0 ? (r[idxPrompt] ?? "").trim() : "";
      return { label: r[idxLabel] ?? "", min_score: min, max_score: max, pct, scoring_prompt };
    });
}

function fmtSkipDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${SKIP_MONTHS[m - 1]} ${y}`;
}

const DEFAULT_TIERS: PayoutTier[] = [
  { label: "Approved",      min_score: 8, max_score: 10, pct: 100 },
  { label: "Half Approved", min_score: 6, max_score: 7,  pct: 75  },
  { label: "Rejected",      min_score: 0, max_score: 5,  pct: 0   },
];

export function CampaignForm({
  mode,
  campaignId,
  initial,
  executionTypes,
  departments,
  jobTitles,
  stores,
  statuses,
  categories,
}: {
  mode: "create" | "edit";
  campaignId?: string;
  initial: CampaignFormValues;
  executionTypes: Opt[];
  departments: Opt[];
  jobTitles: Opt[];
  stores: StoreOpt[];
  statuses: Opt[];
  categories: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<CampaignFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [skipDateInput, setSkipDateInput] = useState("");

  const [testPhotoUrl, setTestPhotoUrl] = useState<string | null>(null);
  const [testUploading, setTestUploading] = useState(false);
  const [testPending, testStart] = useTransition();
  const [testResult, setTestResult] = useState<TestAiResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [rubricPending, rubricStart] = useTransition();
  const [rubricError, setRubricError] = useState<string | null>(null);

  const [instructionsPending, instructionsStart] = useTransition();
  const [instructionsError, setInstructionsError] = useState<string | null>(null);

  const [skuPasteMode, setSkuPasteMode] = useState(false);
  const [skuPasteText, setSkuPasteText] = useState("");

  const [tierPasteMode, setTierPasteMode] = useState(false);
  const [tierPasteText, setTierPasteText] = useState("");

  function set<K extends keyof CampaignFormValues>(k: K, val: CampaignFormValues[K]) {
    setV((p) => ({ ...p, [k]: val }));
  }

  async function onUploadFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("campaign-references")
        .upload(path, file, { upsert: false });
      if (upErr) {
        setError(upErr.message);
        continue;
      }
      const { data } = supabase.storage.from("campaign-references").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    setV((p) => ({ ...p, reference_images: [...p.reference_images, ...urls] }));
    setUploading(false);
    e.target.value = "";
  }

  function removeImage(index: number) {
    setV((p) => ({
      ...p,
      reference_images: p.reference_images.filter((_, i) => i !== index),
    }));
  }

  async function onTestUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTestUploading(true);
    setTestError(null);
    setTestResult(null);
    const supabase = createClient();
    const path = `test/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("campaign-references").upload(path, file);
    if (upErr) { setTestError(upErr.message); setTestUploading(false); return; }
    const { data } = supabase.storage.from("campaign-references").getPublicUrl(path);
    setTestPhotoUrl(data.publicUrl);
    setTestUploading(false);
    e.target.value = "";
  }

  function runTest() {
    if (!testPhotoUrl) return;
    setTestResult(null);
    setTestError(null);
    testStart(async () => {
      const res = await testAiPrompt({
        referenceImages: v.reference_images,
        testPhotos: [testPhotoUrl],
        instructions: v.instructions,
        rubric: v.scoring_rubric,
        strictness: v.ai_strictness,
        passThreshold: v.pass_threshold,
        payoutModel: v.payout_model,
        payoutTiers: v.payout_tiers,
      });
      if (res.error) setTestError(res.error);
      else if (res.result) setTestResult(res.result);
    });
  }

  function generateRubricFromSkus() {
    if (v.scoring_rubric.trim() && !window.confirm("Replace the current rubric with a generated one?")) return;
    setRubricError(null);
    rubricStart(async () => {
      const res = await generateRubric({
        campaignName: v.name,
        executionTypeName: executionTypes.find((t) => t.id === v.execution_type_id)?.name ?? null,
        skus: v.skus,
        payoutTiers: v.payout_model === "tiered" ? v.payout_tiers : [],
      });
      if (res.error) setRubricError(res.error);
      else if (res.rubric) set("scoring_rubric", res.rubric);
    });
  }

  function generateInstructionsFromSkus() {
    if (v.instructions.trim() && !window.confirm("Replace the current instructions with generated ones?")) return;
    setInstructionsError(null);
    instructionsStart(async () => {
      const res = await generateInstructions({
        campaignName: v.name,
        executionTypeName: executionTypes.find((t) => t.id === v.execution_type_id)?.name ?? null,
        skus: v.skus,
      });
      if (res.error) setInstructionsError(res.error);
      else if (res.instructions) set("instructions", res.instructions);
    });
  }

  function submit() {
    setError(null);
    if (!v.name.trim()) {
      setError("Campaign name is required.");
      return;
    }
    start(async () => {
      const res =
        mode === "edit" && campaignId
          ? await updateCampaign(campaignId, v)
          : await createCampaign(v);
      if (res?.error) setError(res.error);
      else router.push("/campaigns");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {mode === "edit" ? "Edit campaign" : "New campaign"}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="md" onClick={() => router.push("/campaigns")}>
            Cancel
          </Button>
          <Button size="md" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save campaign"}
          </Button>
        </div>
      </div>

      <Section title="Basics">
        <div className="space-y-1.5">
          <label className={labelClass}>Campaign name</label>
          <Input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Ariel + Whisper" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className={labelClass}>Execution type</label>
            <select
              className={selectClass}
              value={v.execution_type_id ?? ""}
              onChange={(e) => set("execution_type_id", e.target.value || null)}
            >
              <option value="">—</option>
              {executionTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Frequency</label>
            <select
              className={selectClass}
              value={v.frequency}
              onChange={(e) => set("frequency", e.target.value as Frequency)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Status</label>
            <select
              className={selectClass}
              value={v.status}
              onChange={(e) => set("status", e.target.value as CampaignStatus)}
            >
              {statuses.map((s) => (
                <option key={s.id} value={s.name} className="capitalize">
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Category</label>
          <select
            className={selectClass}
            value={v.category_id ?? ""}
            onChange={(e) => set("category_id", e.target.value || null)}
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            e.g. Brand Visibility for Tide, Ariel, Surf Excel — lets you list the SKUs it&apos;s tracking below.
            Add more categories in Settings.
          </p>
        </div>
      </Section>

      {v.category_id && (
        <Section title="SKUs">
          <div className="flex items-center justify-between">
            <label className={labelClass}>Tracked SKUs</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setSkuPasteMode((p) => !p); setSkuPasteText(""); }}
                className={cn(
                  "flex items-center gap-1 text-xs hover:underline",
                  skuPasteMode ? "text-muted-foreground" : "text-primary",
                )}
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                {skuPasteMode ? "Cancel" : "Paste from CSV"}
              </button>
              <button
                type="button"
                onClick={() =>
                  set("skus", [...v.skus, { name: "", qty: 0, facings: 0, shelf_number: "" }])
                }
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Add SKU
              </button>
            </div>
          </div>

          {skuPasteMode && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              <textarea
                value={skuPasteText}
                onChange={(e) => setSkuPasteText(e.target.value)}
                rows={4}
                placeholder={
                  "Paste rows from Excel/Sheets or CSV — one SKU per line:\n" +
                  "Surf Excel Matic Liquid Top Load Bottle 1L, 4, 2, 1\n" +
                  "Surf Excel Matic Liquid Top Load Pouch 4L, 6, 3, 2"
                }
                className={textareaClass + " font-mono text-xs"}
              />
              <p className="text-[11px] text-muted-foreground">
                Columns: SKU name, Qty, Facings, Shelf # (Qty/Facings/Shelf # can be left blank).
              </p>
              {skuPasteText.trim() && (() => {
                const parsed = parseSkuPaste(skuPasteText);
                return (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-success">{parsed.length} SKU{parsed.length !== 1 ? "s" : ""} parsed</span>
                    <Button
                      size="md"
                      onClick={() => {
                        set("skus", [...v.skus, ...parsed]);
                        setSkuPasteMode(false);
                        setSkuPasteText("");
                      }}
                      disabled={parsed.length === 0}
                    >
                      Add {parsed.length} SKU{parsed.length !== 1 ? "s" : ""}
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">SKU name</th>
                  <th className="px-3 py-2 text-left font-semibold">Qty</th>
                  <th className="px-3 py-2 text-left font-semibold">Facings</th>
                  <th className="px-3 py-2 text-left font-semibold">Shelf #</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {v.skus.map((sku, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        value={sku.name}
                        placeholder="e.g. Tide 1kg"
                        onChange={(e) => {
                          const skus = [...v.skus];
                          skus[i] = { ...skus[i], name: e.target.value };
                          set("skus", skus);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        value={String(sku.qty)}
                        onChange={(e) => {
                          const skus = [...v.skus];
                          skus[i] = { ...skus[i], qty: Number(e.target.value) };
                          set("skus", skus);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        value={String(sku.facings)}
                        onChange={(e) => {
                          const skus = [...v.skus];
                          skus[i] = { ...skus[i], facings: Number(e.target.value) };
                          set("skus", skus);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        value={sku.shelf_number}
                        placeholder="e.g. 3"
                        onChange={(e) => {
                          const skus = [...v.skus];
                          skus[i] = { ...skus[i], shelf_number: e.target.value };
                          set("skus", skus);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => set("skus", v.skus.filter((_, j) => j !== i))}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {v.skus.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-xs text-muted-foreground">
                      No SKUs yet — click &quot;Add SKU&quot; above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="Schedule">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className={labelClass}>Start date</label>
            <Input type="date" value={v.start_date ?? ""} onChange={(e) => set("start_date", e.target.value || null)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>End date</label>
            <Input type="date" value={v.end_date ?? ""} onChange={(e) => set("end_date", e.target.value || null)} />
          </div>
        </div>
        {v.frequency === "daily" && (
          <div className="space-y-2">
            <label className={labelClass}>Skip specific dates</label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={skipDateInput}
                onChange={(e) => setSkipDateInput(e.target.value)}
              />
              <Button
                variant="outline"
                size="md"
                onClick={() => {
                  if (skipDateInput && !v.skip_dates.includes(skipDateInput)) {
                    set("skip_dates", [...v.skip_dates, skipDateInput].sort());
                    setSkipDateInput("");
                  }
                }}
                disabled={!skipDateInput || v.skip_dates.includes(skipDateInput)}
              >
                Add
              </Button>
            </div>
            {v.skip_dates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {v.skip_dates.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs text-foreground"
                  >
                    {fmtSkipDate(d)}
                    <button
                      type="button"
                      onClick={() => set("skip_dates", v.skip_dates.filter((x) => x !== d))}
                      className="text-muted-foreground hover:text-danger"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Tasks on these dates will not be created and won&apos;t appear in reports.
            </p>
          </div>
        )}
      </Section>

      <Section title="Instructions & reference">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className={labelClass}>Execution instructions</label>
            <button
              type="button"
              onClick={generateInstructionsFromSkus}
              disabled={instructionsPending}
              className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {instructionsPending ? "Generating…" : "Generate from execution type & SKUs"}
            </button>
          </div>
          <textarea
            className={textareaClass}
            value={v.instructions}
            onChange={(e) => set("instructions", e.target.value)}
            placeholder="Place all products on the end-cap display, branding at eye level, fully stocked…"
          />
          {instructionsError && <p className="text-xs font-medium text-danger">{instructionsError}</p>}
        </div>
        <div className="space-y-2">
          <label className={labelClass}>Reference images</label>
          <div className="flex flex-wrap gap-3">
            {v.reference_images.map((url, i) => (
              <div key={url} className="relative h-24 w-24 overflow-hidden rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Reference" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  aria-label="Remove image"
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:bg-muted">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onUploadFiles}
                disabled={uploading}
              />
              <ImagePlus className="h-5 w-5" />
              {uploading ? "Uploading…" : "Add"}
            </label>
          </div>
        </div>
      </Section>

      <Section title="Targeting">
        <div className="space-y-1.5">
          <label className={labelClass}>Departments</label>
          <MultiSelect
            options={departments.map((d) => ({ id: d.id, label: d.name }))}
            selected={v.departmentIds}
            onChange={(ids) => set("departmentIds", ids)}
            placeholder="Select departments…"
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Target job titles (optional)</label>
          <MultiSelect
            options={jobTitles.map((j) => ({ id: j.id, label: j.name }))}
            selected={v.jobTitleIds}
            onChange={(ids) => set("jobTitleIds", ids)}
            placeholder="Anyone at the store"
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Assigned stores</label>
          <StorePicker
            options={stores}
            selected={v.storeIds}
            onChange={(ids) => set("storeIds", ids)}
          />
        </div>
      </Section>

      <Section title="Payout">
        <Toggle label="Enable payout" checked={v.payout_enabled} onChange={(b) => set("payout_enabled", b)} />
        {v.payout_enabled && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass}>Amount (₹) per passing cycle</label>
                <Input
                  type="number"
                  value={String(v.payout_amount)}
                  onChange={(e) => set("payout_amount", Number(e.target.value))}
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Payout model</label>
                <div className="flex gap-3">
                  {(["binary", "tiered"] as const).map((m) => (
                    <label
                      key={m}
                      className={cn(
                        "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                        v.payout_model === m
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <input
                        type="radio"
                        name="payout_model"
                        value={m}
                        checked={v.payout_model === m}
                        onChange={() => {
                          set("payout_model", m);
                          if (m === "tiered" && v.payout_tiers.length === 0) {
                            set("payout_tiers", DEFAULT_TIERS);
                          }
                        }}
                        className="sr-only"
                      />
                      <span className="capitalize">{m}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {v.payout_model === "binary"
                    ? "Full amount if approved, ₹0 if rejected."
                    : "Percentage of amount based on final score."}
                </p>
              </div>
            </div>

            {v.payout_model === "tiered" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Score tiers</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => { setTierPasteMode((p) => !p); setTierPasteText(""); }}
                      className={cn(
                        "flex items-center gap-1 text-xs hover:underline",
                        tierPasteMode ? "text-muted-foreground" : "text-primary",
                      )}
                    >
                      <ClipboardPaste className="h-3.5 w-3.5" />
                      {tierPasteMode ? "Cancel" : "Paste from Excel"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        set("payout_tiers", [...v.payout_tiers, { label: "", min_score: 0, max_score: 10, pct: 50 }])
                      }
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      Add tier
                    </button>
                  </div>
                </div>

                {tierPasteMode && (
                  <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                    <textarea
                      value={tierPasteText}
                      onChange={(e) => setTierPasteText(e.target.value)}
                      rows={4}
                      placeholder={
                        "Paste a tier table from Excel/Sheets — needs a header row with " +
                        "Label / Score (e.g. \"5-6\") / Payout columns. Other columns are ignored:\n" +
                        "Label\tBrand Score\tPayout\nRejected\t0-3\t0%\nApproved\t7-10\t100%"
                      }
                      className={textareaClass + " font-mono text-xs"}
                    />
                    {tierPasteText.trim() && (() => {
                      const parsed = parseTierPaste(tierPasteText);
                      return (
                        <div className="flex items-center gap-3">
                          {parsed.length > 0 ? (
                            <span className="text-xs font-medium text-success">{parsed.length} tier{parsed.length !== 1 ? "s" : ""} parsed</span>
                          ) : (
                            <span className="text-xs font-medium text-danger">
                              No Label/Score/Payout columns found — check the header row.
                            </span>
                          )}
                          <Button
                            size="md"
                            onClick={() => {
                              set("payout_tiers", parsed);
                              setTierPasteMode(false);
                              setTierPasteText("");
                            }}
                            disabled={parsed.length === 0}
                          >
                            Replace with {parsed.length} tier{parsed.length !== 1 ? "s" : ""}
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 text-left font-semibold">Label</th>
                        <th className="px-3 py-2 text-left font-semibold">Min score</th>
                        <th className="px-3 py-2 text-left font-semibold">Max score</th>
                        <th className="px-3 py-2 text-left font-semibold">Payout %</th>
                        <th className="px-3 py-2 text-left font-semibold">Scoring prompt (for AI)</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {v.payout_tiers.map((tier, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <Input
                              type="text"
                              value={tier.label}
                              placeholder="e.g. Approved"
                              onChange={(e) => {
                                const tiers = [...v.payout_tiers];
                                tiers[i] = { ...tiers[i], label: e.target.value };
                                set("payout_tiers", tiers);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              value={String(tier.min_score)}
                              min="0"
                              max="10"
                              onChange={(e) => {
                                const tiers = [...v.payout_tiers];
                                tiers[i] = { ...tiers[i], min_score: Number(e.target.value) };
                                set("payout_tiers", tiers);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              value={String(tier.max_score)}
                              min="0"
                              max="10"
                              onChange={(e) => {
                                const tiers = [...v.payout_tiers];
                                tiers[i] = { ...tiers[i], max_score: Number(e.target.value) };
                                set("payout_tiers", tiers);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              value={String(tier.pct)}
                              min="0"
                              max="100"
                              onChange={(e) => {
                                const tiers = [...v.payout_tiers];
                                tiers[i] = { ...tiers[i], pct: Number(e.target.value) };
                                set("payout_tiers", tiers);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="text"
                              value={tier.scoring_prompt ?? ""}
                              placeholder="e.g. 4 or more products present"
                              onChange={(e) => {
                                const tiers = [...v.payout_tiers];
                                tiers[i] = { ...tiers[i], scoring_prompt: e.target.value };
                                set("payout_tiers", tiers);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                set("payout_tiers", v.payout_tiers.filter((_, j) => j !== i))
                              }
                              className="rounded-lg p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {v.payout_tiers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-xs text-muted-foreground">
                            No tiers yet — click "Add tier" above.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Score = reviewer score if given, otherwise AI score. First matching tier (top-down) wins.
                  Payout = % of the amount above.
                </p>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="AI & review">
        <Toggle
          label="AI review"
          hint="On: AI scores first. Off: goes straight to a manual reviewer."
          checked={v.ai_review}
          onChange={(b) => set("ai_review", b)}
        />
        {v.ai_review && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className={labelClass}>AI strictness</label>
                <select className={selectClass} value={v.ai_strictness} onChange={(e) => set("ai_strictness", e.target.value as AIStrictness)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              {v.payout_model !== "tiered" && (
                <div className="space-y-1.5">
                  <label className={labelClass}>Pass threshold (/10)</label>
                  <Input type="number" value={String(v.pass_threshold)} onChange={(e) => set("pass_threshold", Number(e.target.value))} inputMode="decimal" />
                </div>
              )}
              <div className="space-y-1.5">
                <label className={labelClass}>Score mode</label>
                <select className={selectClass} value={v.score_mode} onChange={(e) => set("score_mode", e.target.value as ScoreMode)}>
                  <option value="reviewer_preferred">Reviewer preferred</option>
                  <option value="ai_preferred">AI preferred</option>
                  <option value="ai_auto_approve">AI auto-approve</option>
                </select>
              </div>
            </div>
            <Toggle label="Show AI score to reviewer" hint="Off enables the prevent-bias review flow." checked={v.ai_score_visible} onChange={(b) => set("ai_score_visible", b)} />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Brand scoring rubric</label>
                <button
                  type="button"
                  onClick={generateRubricFromSkus}
                  disabled={rubricPending}
                  className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {rubricPending ? "Generating…" : "Generate from execution type & SKUs"}
                </button>
              </div>
              <textarea
                className={textareaClass}
                value={v.scoring_rubric}
                onChange={(e) => set("scoring_rubric", e.target.value)}
                placeholder="e.g. Full product facing forward = high score; missing signage = reject…"
              />
              {rubricError && <p className="text-xs font-medium text-danger">{rubricError}</p>}
              <p className="text-xs text-muted-foreground">
                Drafts a rubric from the execution type and tracked SKUs above — always review before saving.
              </p>
            </div>

            {/* Prompt tester */}
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Test this campaign</p>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Upload a sample photo to preview how the AI would score it using the current (unsaved) settings.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {testPhotoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={testPhotoUrl} alt="Test" className="h-16 w-16 rounded-lg border border-border object-cover" />
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                  <input type="file" accept="image/*" className="hidden" onChange={onTestUpload} disabled={testUploading} />
                  {testUploading ? "Uploading…" : testPhotoUrl ? "Change photo" : "Upload test photo"}
                </label>
                <Button size="md" onClick={runTest} disabled={testPending || !testPhotoUrl || testUploading}>
                  {testPending ? "Running…" : "Run AI test"}
                </Button>
              </div>
              {testError && <p className="mt-2 text-sm text-danger">{testError}</p>}
              {testResult && (
                <div className="mt-3 rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-foreground">{testResult.score}/10</span>
                    {(() => {
                      const label = testResult.tierLabel ?? testResult.verdict;
                      let cls = testResult.verdict === "approved" ? "bg-success/10 text-success" : "bg-danger/10 text-danger";
                      if (testResult.tierLabel) {
                        const tier = v.payout_tiers.find((t) => t.label === testResult.tierLabel);
                        if (tier) {
                          cls = tier.pct === 100 ? "bg-success/10 text-success"
                              : tier.pct === 0   ? "bg-danger/10 text-danger"
                              : "bg-warning/10 text-warning";
                        }
                      }
                      return (
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", cls)}>
                          {label}
                        </span>
                      );
                    })()}
                  </div>
                  {testResult.assessment && (
                    <ul className="mt-2 list-inside list-disc space-y-0.5 text-muted-foreground">
                      {testResult.assessment.split("\n").map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">Using current unsaved settings.</p>
                </div>
              )}
            </div>
          </>
        )}
      </Section>

      <Section title="Photo capture">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className={labelClass}>Capture mode</label>
            <select className={selectClass} value={v.capture_mode} onChange={(e) => set("capture_mode", e.target.value as CaptureMode)}>
              <option value="camera">Camera only (live, GPS + time)</option>
              <option value="gallery">Allow gallery</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Number of photos (1–3)</label>
            <Input type="number" min={1} max={3} value={String(v.num_photos)} onChange={(e) => set("num_photos", Number(e.target.value))} />
          </div>
        </div>
      </Section>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="md" onClick={() => router.push("/campaigns")}>
          Cancel
        </Button>
        <Button size="md" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save campaign"}
        </Button>
      </div>
    </div>
  );
}
