"use client";

import { useState, useTransition, type ReactNode, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ImagePlus, PlusCircle, Trash2, X, Wand2 } from "lucide-react";
import { Input } from "@/core/ui/input";
import { Button } from "@/core/ui/button";
import { MultiSelect } from "@/core/ui/multi-select";
import { createClient } from "@/core/db/client";
import { cn } from "@/core/lib/utils";
import { SkuRequirementBuilder } from "./sku-requirement-builder";
import { buildRubricFromRequirement } from "../rubric";
import { createMonth, updateMonth } from "../actions";
import type { MonthFormValues } from "../types";

type Opt = { id: string; name: string };
type StoreOpt = { id: string; label: string };

const selectClass =
  "w-full rounded-xl border border-transparent bg-input px-4 py-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "block text-sm font-medium text-foreground";
const textareaClass = selectClass + " min-h-24 resize-y";

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--primary)]" />
      <span>
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

const DEFAULT_TIERS = [
  { label: "Fully approved", min_score: 9, max_score: 10, pct: 100 },
  { label: "Adequately approved", min_score: 7, max_score: 8.9, pct: 75 },
  { label: "Half approved", min_score: 5, max_score: 6.9, pct: 50 },
  { label: "Rejected", min_score: 0, max_score: 4.9, pct: 0 },
];

export function MonthForm({
  mode,
  contestId,
  contestName,
  campaignId,
  initial,
  executionTypes,
  departments,
  jobTitles,
  stores,
  statuses,
}: {
  mode: "create" | "edit";
  contestId: string;
  contestName: string;
  campaignId?: string;
  initial: MonthFormValues;
  executionTypes: Opt[];
  departments: Opt[];
  jobTitles: Opt[];
  stores: StoreOpt[];
  statuses: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<MonthFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function set<K extends keyof MonthFormValues>(k: K, val: MonthFormValues[K]) {
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
      const { error: upErr } = await supabase.storage.from("campaign-references").upload(path, file, { upsert: false });
      if (upErr) {
        setError(upErr.message);
        continue;
      }
      const { data } = supabase.storage.from("campaign-references").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    set("referenceImages", [...v.referenceImages, ...urls]);
    setUploading(false);
    e.target.value = "";
  }

  function removeImage(index: number) {
    set("referenceImages", v.referenceImages.filter((_, i) => i !== index));
  }

  function rebuildRubric() {
    set("scoringRubric", buildRubricFromRequirement(v.requirement, v.skus));
  }

  function submit() {
    setError(null);
    if (!v.name.trim()) {
      setError("Month name is required.");
      return;
    }
    start(async () => {
      const res =
        mode === "edit" && campaignId
          ? await updateMonth(campaignId, contestId, v)
          : await createMonth(contestId, v);
      if (res?.error) setError(res.error);
      else router.push(`/brand-visibility/${contestId}`);
    });
  }

  const weeklyTotal = v.payoutEnabled ? v.storeIds.length * v.payoutAmount : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            <Link href="/brand-visibility" className="hover:text-foreground">Brand visibility</Link>
            {" › "}
            <Link href={`/brand-visibility/${contestId}`} className="hover:text-foreground">{contestName}</Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {mode === "edit" ? v.name || "Edit month" : "New month"}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="md" onClick={() => router.push(`/brand-visibility/${contestId}`)}>
            Cancel
          </Button>
          <Button size="md" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : v.status === "active" ? "Save and start month" : "Save"}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      <Section title="Basics">
        <div className="space-y-1.5">
          <label className={labelClass}>Month name</label>
          <Input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="September" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className={labelClass}>Execution type</label>
            <select className={selectClass} value={v.executionTypeId ?? ""} onChange={(e) => set("executionTypeId", e.target.value || null)}>
              <option value="">—</option>
              {executionTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Frequency</label>
            <select className={selectClass} value={v.frequency} onChange={(e) => set("frequency", e.target.value as MonthFormValues["frequency"])}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Status</label>
            <select className={selectClass} value={v.status} onChange={(e) => set("status", e.target.value)}>
              {statuses.map((s) => (
                <option key={s.id} value={s.name} className="capitalize">{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className={labelClass}>Start date</label>
            <Input type="date" value={v.startDate ?? ""} onChange={(e) => set("startDate", e.target.value || null)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>End date</label>
            <Input type="date" value={v.endDate ?? ""} onChange={(e) => set("endDate", e.target.value || null)} />
          </div>
        </div>
      </Section>

      <Section title="Who does it">
        <div className="grid gap-4 sm:grid-cols-2">
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
            <label className={labelClass}>Job titles (optional)</label>
            <MultiSelect
              options={jobTitles.map((j) => ({ id: j.id, label: j.name }))}
              selected={v.jobTitleIds}
              onChange={(ids) => set("jobTitleIds", ids)}
              placeholder="Anyone at the store"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Stores</label>
          <MultiSelect options={stores} selected={v.storeIds} onChange={(ids) => set("storeIds", ids)} placeholder="Select stores…" />
        </div>
      </Section>

      <Section
        title="Required on shelf"
        action={
          <button type="button" onClick={rebuildRubric} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Wand2 className="h-3.5 w-3.5" /> Rebuild rubric from this
          </button>
        }
      >
        <SkuRequirementBuilder
          requirement={v.requirement}
          skus={v.skus}
          onChangeRequirement={(r) => set("requirement", r)}
          onChangeSkus={(s) => set("skus", s)}
        />
      </Section>

      <Section title="Scoring rubric">
        <div className="space-y-1.5">
          <label className={labelClass}>What the AI (and reviewer) check against</label>
          <textarea
            className={textareaClass}
            value={v.scoringRubric}
            onChange={(e) => set("scoringRubric", e.target.value)}
            placeholder="Click “Rebuild rubric from this” above once the requirement is filled in, then edit freely."
          />
          <p className="text-xs text-muted-foreground">
            Rebuilding overwrites this field — it&apos;s never applied automatically as you edit the requirement above.
          </p>
        </div>
      </Section>

      <Section title="Instructions & reference">
        <div className="space-y-1.5">
          <label className={labelClass}>Instructions for the field team</label>
          <textarea
            className={textareaClass}
            value={v.instructions}
            onChange={(e) => set("instructions", e.target.value)}
            placeholder="Photograph the full display from the front, lights on, so every shelf is visible in one frame."
          />
        </div>
        <div className="space-y-2">
          <label className={labelClass}>Reference images</label>
          <div className="flex flex-wrap gap-3">
            {v.referenceImages.map((url, i) => (
              <div key={url} className="relative h-24 w-24 overflow-hidden rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Reference" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeImage(i)} aria-label="Remove image" className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:bg-muted">
              <input type="file" accept="image/*" multiple className="hidden" onChange={onUploadFiles} disabled={uploading} />
              <ImagePlus className="h-5 w-5" />
              {uploading ? "Uploading…" : "Add"}
            </label>
          </div>
        </div>
      </Section>

      <Section title="AI review">
        <Toggle label="Use AI" hint="Off: goes straight to a manual reviewer." checked={v.aiReview} onChange={(b) => set("aiReview", b)} />
        {v.aiReview && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className={labelClass}>Strictness</label>
                <select className={selectClass} value={v.aiStrictness} onChange={(e) => set("aiStrictness", e.target.value as MonthFormValues["aiStrictness"])}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              {v.payoutModel !== "tiered" && (
                <div className="space-y-1.5">
                  <label className={labelClass}>Pass threshold (/10)</label>
                  <Input type="number" value={String(v.passThreshold)} onChange={(e) => set("passThreshold", Number(e.target.value))} inputMode="decimal" />
                </div>
              )}
              <div className="space-y-1.5">
                <label className={labelClass}>Score mode</label>
                <select className={selectClass} value={v.scoreMode} onChange={(e) => set("scoreMode", e.target.value)}>
                  <option value="reviewer_preferred">Reviewer preferred</option>
                  <option value="ai_preferred">AI preferred</option>
                  <option value="ai_auto_approve">AI auto-approve</option>
                </select>
              </div>
            </div>
            <Toggle label="Show AI score to reviewer" hint="Off enables the prevent-bias review flow." checked={v.aiScoreVisible} onChange={(b) => set("aiScoreVisible", b)} />
          </>
        )}
      </Section>

      <Section title="What the field team sees">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className={labelClass}>Capture</label>
            <select className={selectClass} value={v.captureMode} onChange={(e) => set("captureMode", e.target.value as MonthFormValues["captureMode"])}>
              <option value="camera">Camera only</option>
              <option value="gallery">Camera or gallery</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Photos required</label>
            <Input type="number" min={1} max={5} value={String(v.numPhotos)} onChange={(e) => set("numPhotos", Number(e.target.value))} />
          </div>
        </div>
      </Section>

      <Section title="Payout">
        <Toggle label="Enable payout" checked={v.payoutEnabled} onChange={(b) => set("payoutEnabled", b)} />
        {v.payoutEnabled && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass}>Amount (₹) per store per cycle</label>
                <Input type="number" value={String(v.payoutAmount)} onChange={(e) => set("payoutAmount", Number(e.target.value))} inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Payout model</label>
                <div className="flex gap-3">
                  {(["binary", "tiered"] as const).map((m) => (
                    <label
                      key={m}
                      className={cn(
                        "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                        v.payoutModel === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <input
                        type="radio"
                        name="payout_model"
                        value={m}
                        checked={v.payoutModel === m}
                        onChange={() => {
                          set("payoutModel", m);
                          if (m === "tiered" && v.payoutTiers.length === 0) set("payoutTiers", DEFAULT_TIERS);
                        }}
                        className="sr-only"
                      />
                      <span className="capitalize">{m}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {v.payoutModel === "tiered" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Score tiers</label>
                  <button
                    type="button"
                    onClick={() => set("payoutTiers", [...v.payoutTiers, { label: "", min_score: 0, max_score: 10, pct: 50 }])}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    Add tier
                  </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 text-left font-semibold">Label</th>
                        <th className="px-3 py-2 text-left font-semibold">Min score</th>
                        <th className="px-3 py-2 text-left font-semibold">Max score</th>
                        <th className="px-3 py-2 text-left font-semibold">Payout %</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {v.payoutTiers.map((tier, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <Input type="text" value={tier.label} placeholder="e.g. Fully approved" onChange={(e) => {
                              const tiers = [...v.payoutTiers];
                              tiers[i] = { ...tiers[i], label: e.target.value };
                              set("payoutTiers", tiers);
                            }} />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" value={String(tier.min_score)} min="0" max="10" onChange={(e) => {
                              const tiers = [...v.payoutTiers];
                              tiers[i] = { ...tiers[i], min_score: Number(e.target.value) };
                              set("payoutTiers", tiers);
                            }} />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" value={String(tier.max_score)} min="0" max="10" onChange={(e) => {
                              const tiers = [...v.payoutTiers];
                              tiers[i] = { ...tiers[i], max_score: Number(e.target.value) };
                              set("payoutTiers", tiers);
                            }} />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" value={String(tier.pct)} min="0" max="100" onChange={(e) => {
                              const tiers = [...v.payoutTiers];
                              tiers[i] = { ...tiers[i], pct: Number(e.target.value) };
                              set("payoutTiers", tiers);
                            }} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={() => set("payoutTiers", v.payoutTiers.filter((_, j) => j !== i))} className="rounded-lg p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {v.payoutTiers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-xs text-muted-foreground">No tiers yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {v.storeIds.length} store{v.storeIds.length === 1 ? "" : "s"} × ₹{v.payoutAmount.toLocaleString("en-IN")} ={" "}
              <span className="font-medium text-foreground">₹{weeklyTotal.toLocaleString("en-IN")}</span> per cycle at full compliance.
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
