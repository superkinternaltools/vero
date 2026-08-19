"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, Download, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/core/ui/button";
import { Input } from "@/core/ui/input";
import { Modal } from "@/core/ui/modal";
import { cn } from "@/core/lib/utils";
import type { Store, StoreInput } from "../types";
import { createStore, updateStore, deleteStore, bulkUploadStores } from "../actions";

type FormState = {
  code: string;
  name: string;
  aligned: boolean;
  store_type: "" | "FOFO" | "COCO";
  latitude: string;
  longitude: string;
  opened_at: string;
  closed_at: string;
};

const EMPTY: FormState = {
  code: "",
  name: "",
  aligned: false,
  store_type: "",
  latitude: "",
  longitude: "",
  opened_at: "",
  closed_at: "",
};

function isStoreActive(s: Store, today: string): boolean {
  return (!s.opened_at || s.opened_at <= today) && (!s.closed_at || s.closed_at >= today);
}

type AlignedFilter = "all" | "yes" | "no";
type TypeFilter = "all" | "FOFO" | "COCO";
type ActiveFilter = "all" | "active" | "closed";

export function StoresClient({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [alignedFilter, setAlignedFilter] = useState<AlignedFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

  const today = new Date().toISOString().slice(0, 10);
  const filteredStores = stores.filter((s) => {
    if (alignedFilter !== "all" && s.aligned !== (alignedFilter === "yes")) return false;
    if (typeFilter !== "all" && s.store_type !== typeFilter) return false;
    if (activeFilter !== "all" && isStoreActive(s, today) !== (activeFilter === "active")) return false;
    return true;
  });
  const filtersApplied = alignedFilter !== "all" || typeFilter !== "all" || activeFilter !== "all";

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }

  function openEdit(s: Store) {
    setEditing(s);
    setForm({
      code: s.code,
      name: s.name,
      aligned: s.aligned,
      store_type: s.store_type ?? "",
      latitude: s.latitude?.toString() ?? "",
      longitude: s.longitude?.toString() ?? "",
      opened_at: s.opened_at ?? "",
      closed_at: s.closed_at ?? "",
    });
    setError(null);
    setOpen(true);
  }

  function submit() {
    const payload: StoreInput = {
      code: form.code.trim(),
      name: form.name.trim(),
      aligned: form.aligned,
      store_type: form.store_type === "" ? null : form.store_type,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      opened_at: form.opened_at || null,
      closed_at: form.closed_at || null,
    };
    if (!payload.code || !payload.name) {
      setError("Code and name are required.");
      return;
    }
    startTransition(async () => {
      const res = editing
        ? await updateStore(editing.id, payload)
        : await createStore(payload);
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  function remove(s: Store) {
    if (!window.confirm(`Delete store "${s.code}"? It can be restored later.`)) return;
    startTransition(async () => {
      const res = await deleteStore(s.id);
      if (!res?.error) router.refresh();
    });
  }

  function downloadTemplate() {
    const csv =
      "code,name,aligned,store_type,latitude,longitude,opened_at,closed_at\n" +
      "001,VSR Mart,yes,FOFO,17.44,78.39,2024-01-15,\n" +
      "002,KVR Mart,no,COCO,17.45,78.41,2023-06-01,2026-03-31\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vero-stores-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(v: string | number | boolean | null): string {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv() {
    const header = "code,name,aligned,store_type,latitude,longitude,opened_at,closed_at";
    const rows = stores.map((s) =>
      [
        csvCell(s.code),
        csvCell(s.name),
        csvCell(s.aligned ? "yes" : "no"),
        csvCell(s.store_type),
        csvCell(s.latitude),
        csvCell(s.longitude),
        csvCell(s.opened_at),
        csvCell(s.closed_at),
      ].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vero-stores-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    startTransition(async () => {
      const res = await bulkUploadStores(text);
      if (res?.error) window.alert(res.error);
      else {
        window.alert(`Imported ${res.count} store(s).`);
        router.refresh();
      }
    });
  }

  const field = "block text-sm font-medium text-foreground";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Stores</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtersApplied
              ? `${filteredStores.length} of ${stores.length} store${stores.length === 1 ? "" : "s"} shown.`
              : `${stores.length} store${stores.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="md" onClick={downloadTemplate}>
            <Download className="h-4 w-4" />
            Template
          </Button>
          <Button variant="outline" size="md" onClick={exportCsv} disabled={stores.length === 0}>
            <Download className="h-4 w-4" />
            Export current stores
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
            <input type="file" accept=".csv" className="hidden" onChange={onCsv} disabled={pending} />
            <Upload className="h-4 w-4" />
            Bulk upload
          </label>
          <Button size="md" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Add store
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground">Aligned</label>
          <select
            value={alignedFilter}
            onChange={(e) => setAlignedFilter(e.target.value as AlignedFilter)}
            className="rounded-lg border border-transparent bg-input px-3 py-1.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
          >
            <option value="all">All</option>
            <option value="yes">Aligned</option>
            <option value="no">Not aligned</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="rounded-lg border border-transparent bg-input px-3 py-1.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
          >
            <option value="all">All</option>
            <option value="FOFO">FOFO</option>
            <option value="COCO">COCO</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground">Active</label>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
            className="rounded-lg border border-transparent bg-input px-3 py-1.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        {filtersApplied && (
          <button
            type="button"
            onClick={() => {
              setAlignedFilter("all");
              setTypeFilter("all");
              setActiveFilter("all");
            }}
            className="text-xs font-medium text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Aligned</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Score</th>
              <th className="px-4 py-3 font-semibold">Active</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStores.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{s.code}</td>
                <td className="px-4 py-3 text-foreground">{s.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                      s.aligned
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {s.aligned ? "Aligned" : "Not aligned"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{s.store_type ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {s.score ?? "Unrated"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                      isStoreActive(s, today) ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isStoreActive(s, today) ? "Active" : "Closed"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      aria-label="Edit"
                      className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      aria-label="Delete"
                      className="rounded-lg p-2 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredStores.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                  {stores.length === 0 ? "No stores yet. Add one, or bulk-upload a CSV." : "No stores match these filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit store" : "Add store"}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className={field}>Store code</label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="001"
            />
          </div>
          <div className="space-y-1.5">
            <label className={field}>Store name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="VSR Mart"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={field}>Type</label>
              <select
                value={form.store_type}
                onChange={(e) =>
                  setForm({ ...form, store_type: e.target.value as FormState["store_type"] })
                }
                className="w-full rounded-xl border border-transparent bg-input px-4 py-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">—</option>
                <option value="FOFO">FOFO</option>
                <option value="COCO">COCO</option>
              </select>
            </div>
            <div className="flex items-end pb-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.aligned}
                  onChange={(e) => setForm({ ...form, aligned: e.target.checked })}
                  className="h-4 w-4 rounded border-border accent-[var(--primary)]"
                />
                Aligned
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={field}>Latitude</label>
              <Input
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                placeholder="17.4"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <label className={field}>Longitude</label>
              <Input
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                placeholder="78.4"
                inputMode="decimal"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={field}>Opening date</label>
              <input
                type="date"
                value={form.opened_at}
                onChange={(e) => setForm({ ...form, opened_at: e.target.value })}
                className="w-full rounded-xl border border-transparent bg-input px-4 py-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className={field}>Closing date</label>
              <input
                type="date"
                value={form.closed_at}
                onChange={(e) => setForm({ ...form, closed_at: e.target.value })}
                className="w-full rounded-xl border border-transparent bg-input px-4 py-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-[11px] text-muted-foreground">Leave blank if still active.</p>
            </div>
          </div>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="md" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="md" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
