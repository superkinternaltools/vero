"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, X, Sparkles } from "lucide-react";
import { Button } from "@/core/ui/button";
import { Input } from "@/core/ui/input";
import { MultiSelect } from "@/core/ui/multi-select";
import { cn } from "@/core/lib/utils";
import { sendCampaignBotMessage } from "../bot-actions";
import { createCampaign } from "../actions";
import type { DraftCampaignInput } from "../types";

type Opt = { id: string; name: string };
type StoreOpt = { id: string; label: string };
type Message = { role: "user" | "assistant"; content: string };
type Draft = DraftCampaignInput & { _key: string };

const selectClass =
  "w-full rounded-xl border border-transparent bg-input px-3 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "block text-xs font-medium text-muted-foreground";

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `draft-${keyCounter}`;
}

/** The model has no structured memory of a draft it proposed in an earlier
 * turn — only its own prior reply text — so a same-named re-proposal can
 * come back with fields it "forgot" (seen live: category/execution type
 * reset to blank when a later turn was really about a different campaign).
 * Take the incoming draft as the base, but for the fields most likely to
 * silently regress, keep the existing value when the incoming one is empty
 * and the existing one wasn't. */
function mergeDraft(existing: DraftCampaignInput, incoming: DraftCampaignInput): DraftCampaignInput {
  const keep = <T,>(oldVal: T, newVal: T, isEmpty: (v: T) => boolean): T =>
    isEmpty(newVal) && !isEmpty(oldVal) ? oldVal : newVal;
  return {
    ...incoming,
    execution_type_id: keep(existing.execution_type_id, incoming.execution_type_id, (v) => !v),
    category_id: keep(existing.category_id, incoming.category_id, (v) => !v),
    brand_id: keep(existing.brand_id, incoming.brand_id, (v) => !v),
    start_date: keep(existing.start_date, incoming.start_date, (v) => !v),
    end_date: keep(existing.end_date, incoming.end_date, (v) => !v),
    instructions: keep(existing.instructions, incoming.instructions, (v) => !v.trim()),
    scoring_rubric: keep(existing.scoring_rubric, incoming.scoring_rubric, (v) => !v.trim()),
    departmentIds: keep(existing.departmentIds, incoming.departmentIds, (v) => v.length === 0),
    storeIds: keep(existing.storeIds, incoming.storeIds, (v) => v.length === 0),
    jobTitleIds: keep(existing.jobTitleIds, incoming.jobTitleIds, (v) => v.length === 0),
    skus: keep(existing.skus, incoming.skus, (v) => v.length === 0),
  };
}

export function CampaignBotClient({
  executionTypes,
  departments,
  jobTitles,
  categories,
  brands,
  stores,
}: {
  executionTypes: Opt[];
  departments: Opt[];
  jobTitles: Opt[];
  categories: Opt[];
  brands: Opt[];
  stores: StoreOpt[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [creating, setCreating] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setInput("");
    const history = messages;
    const stagedNames = drafts.map((d) => d.name);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    startTransition(async () => {
      const res = await sendCampaignBotMessage(history, text, stagedNames);
      setLoading(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: res.reply ?? "" }]);
      if (res.newDrafts?.length) {
        // The model has no ground truth of what's already staged beyond its
        // own prior reply text, so it can re-propose a draft it already
        // staged earlier in the same conversation — sometimes with fields
        // it "forgot" (seen live: category/execution type reset to blank).
        // Dedupe by name and merge field-by-field rather than blindly
        // replacing, so a degraded re-proposal can't silently wipe good data.
        setDrafts((d) => {
          const next = [...d];
          for (const nd of res.newDrafts!) {
            const key = nd.name.trim().toLowerCase();
            const existingIndex = next.findIndex((e) => e.name.trim().toLowerCase() === key);
            if (existingIndex >= 0) next[existingIndex] = { ...mergeDraft(next[existingIndex], nd), _key: next[existingIndex]._key };
            else next.push({ ...nd, _key: nextKey() });
          }
          return next;
        });
        setCreatedCount(null);
      }
    });
  }

  function updateDraft(key: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d._key === key ? { ...d, ...patch } : d)));
  }

  function removeDraft(key: string) {
    setDrafts((ds) => ds.filter((d) => d._key !== key));
    setCreateErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function createAll() {
    if (!drafts.length || creating) return;
    setCreating(true);
    setCreateErrors({});
    setCreatedCount(null);
    startTransition(async () => {
      let created = 0;
      const remaining: Draft[] = [];
      const errors: Record<string, string> = {};
      for (const draft of drafts) {
        const { _key, ...values } = draft;
        const res = await createCampaign({ ...values, reference_images: [] });
        if (res.error) {
          errors[_key] = res.error;
          remaining.push(draft);
        } else {
          created += 1;
        }
      }
      setCreating(false);
      setCreatedCount(created);
      setCreateErrors(errors);
      if (remaining.length === 0) {
        router.push("/campaigns");
      } else {
        setDrafts(remaining);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create with AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask to clone past campaigns or describe new ones — review the drafts below before creating anything.
          </p>
        </div>
        <Button variant="outline" size="md" onClick={() => router.push("/campaigns")}>
          Back to campaigns
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Chat pane ── */}
        <div className="flex flex-col rounded-2xl border border-border bg-card p-4">
          <div ref={scrollRef} className="mb-3 max-h-[60vh] min-h-[320px] flex-1 space-y-3 overflow-y-auto rounded-xl border border-border bg-input p-3">
            {messages.length === 0 && !loading && (
              <p className="p-2 text-center text-xs text-muted-foreground">
                Try: &quot;Set up Tide for October like September&quot; or &quot;Create a new Ariel end-cap campaign for our Kadapa stores&quot;
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-border bg-card px-3.5 py-2 text-sm text-muted-foreground">Thinking…</div>
              </div>
            )}
          </div>

          {error && <p className="mb-2 text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Describe what you need…"
              disabled={loading}
              className="flex-1 rounded-xl border border-transparent bg-input px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="flex shrink-0 items-center justify-center rounded-xl bg-primary px-3.5 text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Draft cards pane ── */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Staged drafts {drafts.length > 0 && `(${drafts.length})`}
            </h2>
          </div>

          {createdCount !== null && createdCount > 0 && (
            <p className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">
              Created {createdCount} campaign{createdCount === 1 ? "" : "s"}.
              {drafts.length > 0 && ` ${drafts.length} failed — see errors below.`}
            </p>
          )}

          {drafts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              No drafts yet — ask the bot to clone or build a campaign and it will appear here for review.
            </p>
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {drafts.map((d) => (
                <DraftCard
                  key={d._key}
                  draft={d}
                  error={createErrors[d._key]}
                  executionTypes={executionTypes}
                  departments={departments}
                  jobTitles={jobTitles}
                  categories={categories}
                  brands={brands}
                  stores={stores}
                  onChange={(patch) => updateDraft(d._key, patch)}
                  onRemove={() => removeDraft(d._key)}
                />
              ))}
            </div>
          )}

          {drafts.length > 0 && (
            <div className="mt-4">
              <Button size="md" onClick={createAll} disabled={creating}>
                {creating ? "Creating…" : `Create ${drafts.length} campaign${drafts.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  error,
  executionTypes,
  departments,
  jobTitles,
  categories,
  brands,
  stores,
  onChange,
  onRemove,
}: {
  draft: Draft;
  error?: string;
  executionTypes: Opt[];
  departments: Opt[];
  jobTitles: Opt[];
  categories: Opt[];
  brands: Opt[];
  stores: StoreOpt[];
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <Input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="!py-2 text-sm font-medium"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove draft"
          className="mt-1 shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="mb-2 text-xs font-medium text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Brand</label>
          <select className={selectClass} value={draft.brand_id ?? ""} onChange={(e) => onChange({ brand_id: e.target.value || null })}>
            <option value="">—</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select className={selectClass} value={draft.category_id ?? ""} onChange={(e) => onChange({ category_id: e.target.value || null })}>
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Execution type</label>
          <select className={selectClass} value={draft.execution_type_id ?? ""} onChange={(e) => onChange({ execution_type_id: e.target.value || null })}>
            <option value="">—</option>
            {executionTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Frequency</label>
          <select className={selectClass} value={draft.frequency} onChange={(e) => onChange({ frequency: e.target.value as Draft["frequency"] })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Start date</label>
          <Input type="date" value={draft.start_date ?? ""} onChange={(e) => onChange({ start_date: e.target.value || null })} className="!py-2" />
        </div>
        <div>
          <label className={labelClass}>End date</label>
          <Input type="date" value={draft.end_date ?? ""} onChange={(e) => onChange({ end_date: e.target.value || null })} className="!py-2" />
        </div>
      </div>

      <div className="mt-2 space-y-2">
        <div>
          <label className={labelClass}>Stores ({draft.storeIds.length})</label>
          <MultiSelect
            options={stores.map((s) => ({ id: s.id, label: s.label }))}
            selected={draft.storeIds}
            onChange={(ids) => onChange({ storeIds: ids })}
            placeholder="Select stores…"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Departments</label>
            <MultiSelect
              options={departments.map((d) => ({ id: d.id, label: d.name }))}
              selected={draft.departmentIds}
              onChange={(ids) => onChange({ departmentIds: ids })}
              placeholder="Any"
            />
          </div>
          <div>
            <label className={labelClass}>Job titles</label>
            <MultiSelect
              options={jobTitles.map((j) => ({ id: j.id, label: j.name }))}
              selected={draft.jobTitleIds}
              onChange={(ids) => onChange({ jobTitleIds: ids })}
              placeholder="Anyone"
            />
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-foreground">
          <input
            type="checkbox"
            checked={draft.payout_enabled}
            onChange={(e) => onChange({ payout_enabled: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-border accent-primary"
          />
          Payout
        </label>
        {draft.payout_enabled && (
          <Input
            type="number"
            value={String(draft.payout_amount)}
            onChange={(e) => onChange({ payout_amount: Number(e.target.value) })}
            className="!py-1.5 w-24 text-sm"
            placeholder="₹ amount"
          />
        )}
        {draft.skus.length > 0 && (
          <span className="ml-auto text-[11px] text-muted-foreground">{draft.skus.length} SKU{draft.skus.length === 1 ? "" : "s"}</span>
        )}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Rubric, instructions, and SKU details can be refined after creation on the full campaign edit page.
      </p>
    </div>
  );
}
