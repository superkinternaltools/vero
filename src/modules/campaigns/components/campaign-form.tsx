"use client";

import { useState, useTransition, type ReactNode, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { X, ImagePlus } from "lucide-react";
import { Input } from "@/core/ui/input";
import { Button } from "@/core/ui/button";
import { MultiSelect } from "@/core/ui/multi-select";
import { createClient } from "@/core/db/client";
import type {
  CampaignFormValues,
  Frequency,
  CampaignStatus,
  ScoreMode,
  AIStrictness,
  CaptureMode,
} from "../types";
import { createCampaign, updateCampaign } from "../actions";

type Opt = { id: string; name: string };
type StoreOpt = { id: string; label: string };

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

export function CampaignForm({
  mode,
  campaignId,
  initial,
  executionTypes,
  departments,
  jobTitles,
  stores,
  statuses,
  payoutModels,
}: {
  mode: "create" | "edit";
  campaignId?: string;
  initial: CampaignFormValues;
  executionTypes: Opt[];
  departments: Opt[];
  jobTitles: Opt[];
  stores: StoreOpt[];
  statuses: Opt[];
  payoutModels: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<CampaignFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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
      </Section>

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
        <Toggle label="Allow late uploads" hint="If off, tasks past their due date are marked Missed." checked={v.allow_late} onChange={(b) => set("allow_late", b)} />
        <Toggle label="Skip weekends (daily)" checked={v.skip_weekends} onChange={(b) => set("skip_weekends", b)} />
        <Toggle label="Skip holidays (daily)" checked={v.skip_holidays} onChange={(b) => set("skip_holidays", b)} />
      </Section>

      <Section title="Instructions & reference">
        <div className="space-y-1.5">
          <label className={labelClass}>Execution instructions</label>
          <textarea
            className={textareaClass}
            value={v.instructions}
            onChange={(e) => set("instructions", e.target.value)}
            placeholder="Place all products on the end-cap display, branding at eye level, fully stocked…"
          />
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
          <MultiSelect
            options={stores.map((s) => ({ id: s.id, label: s.label }))}
            selected={v.storeIds}
            onChange={(ids) => set("storeIds", ids)}
            placeholder="Select stores…"
            emptyText="No stores yet — add some in Stores."
          />
        </div>
      </Section>

      <Section title="Payout">
        <Toggle label="Enable payout" checked={v.payout_enabled} onChange={(b) => set("payout_enabled", b)} />
        {v.payout_enabled && (
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
              <select className={selectClass} value={v.payout_model} onChange={(e) => set("payout_model", e.target.value)}>
                {payoutModels.map((m) => (
                  <option key={m.id} value={m.name} className="capitalize">
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
              <div className="space-y-1.5">
                <label className={labelClass}>Pass threshold (/10)</label>
                <Input type="number" value={String(v.pass_threshold)} onChange={(e) => set("pass_threshold", Number(e.target.value))} inputMode="decimal" />
              </div>
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
              <label className={labelClass}>Brand scoring rubric</label>
              <textarea
                className={textareaClass}
                value={v.scoring_rubric}
                onChange={(e) => set("scoring_rubric", e.target.value)}
                placeholder="e.g. Full product facing forward = high score; missing signage = reject…"
              />
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
