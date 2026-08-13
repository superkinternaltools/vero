"use client";

import { useState } from "react";
import { ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { cn } from "@/core/lib/utils";
import type { SkuRequirement, SkuRequirementMode, SkuRow } from "../types";

const MODES: { id: SkuRequirementMode; label: string; hint: string }[] = [
  { id: "all", label: "All of these", hint: "Every SKU on the list must be present, each at its own shelf and quantity." },
  { id: "any_list", label: "Any of these", hint: "An approved menu — place at least N of them, one shared shelf and quantity." },
  { id: "any_category", label: "Any from category", hint: "No fixed list — any product in the category counts, minimum spread across the shelf." },
];

function newRow(): SkuRow {
  return { id: crypto.randomUUID(), skuCode: "", skuName: "", shelf: null, qty: null };
}

/** Accepts a paste straight out of a spreadsheet — tab-separated if copied
 * from Excel/Sheets, comma-separated if pasted from a CSV file. Columns are
 * code, name, and — only meaningful for mode "all" — shelf, qty. */
function parsePastedSkus(text: string, mode: SkuRequirementMode): SkuRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cols = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim());
      const [code, name, shelf, qty] = cols;
      return {
        id: crypto.randomUUID(),
        skuCode: code ?? "",
        skuName: name ?? "",
        shelf: mode === "all" && shelf ? shelf : null,
        qty: mode === "all" && qty ? Number(qty) || null : null,
      };
    })
    .filter((r) => r.skuCode || r.skuName);
}

export function SkuRequirementBuilder({
  requirement,
  skus,
  onChangeRequirement,
  onChangeSkus,
}: {
  requirement: SkuRequirement;
  skus: SkuRow[];
  onChangeRequirement: (r: SkuRequirement) => void;
  onChangeSkus: (s: SkuRow[]) => void;
}) {
  function setMode(mode: SkuRequirementMode) {
    onChangeRequirement({ ...requirement, mode });
  }
  function patch(patch: Partial<SkuRequirement>) {
    onChangeRequirement({ ...requirement, ...patch });
  }
  function patchRow(id: string, patch: Partial<SkuRow>) {
    onChangeSkus(skus.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeRow(id: string) {
    onChangeSkus(skus.filter((s) => s.id !== id));
  }
  function addRow() {
    onChangeSkus([...skus, newRow()]);
  }

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  function applyPaste() {
    const parsed = parsePastedSkus(pasteText, requirement.mode);
    if (parsed.length) onChangeSkus([...skus, ...parsed]);
    setPasteText("");
    setPasteOpen(false);
  }

  const inputClass =
    "w-full rounded-xl border border-transparent bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:bg-background focus:outline-none";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
              requirement.mode === m.id
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {MODES.find((m) => m.id === requirement.mode)?.hint}
      </p>

      {requirement.mode === "any_category" && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Category</label>
            <input
              value={requirement.category ?? ""}
              onChange={(e) => patch({ category: e.target.value })}
              placeholder="e.g. Cool Drinks"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">At least</label>
            <input
              type="number"
              min={1}
              value={requirement.minProducts ?? ""}
              onChange={(e) => patch({ minProducts: e.target.value ? Number(e.target.value) : null })}
              placeholder="e.g. 5"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Shelf</label>
            <input
              value={requirement.shelf ?? ""}
              onChange={(e) => patch({ shelf: e.target.value })}
              placeholder="e.g. 2 from top"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Total facings across the shelf</label>
            <input
              type="number"
              min={0}
              value={requirement.qty ?? ""}
              onChange={(e) => patch({ qty: e.target.value ? Number(e.target.value) : null, qtyMode: "total" })}
              placeholder="e.g. 30"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {requirement.mode === "any_list" && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">At least</label>
            <input
              type="number"
              min={1}
              value={requirement.minProducts ?? ""}
              onChange={(e) => patch({ minProducts: e.target.value ? Number(e.target.value) : null })}
              placeholder="e.g. 5"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Shelf</label>
            <input
              value={requirement.shelf ?? ""}
              onChange={(e) => patch({ shelf: e.target.value })}
              placeholder="e.g. 2 from top"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Facings per product</label>
            <input
              type="number"
              min={0}
              value={requirement.qty ?? ""}
              onChange={(e) => patch({ qty: e.target.value ? Number(e.target.value) : null, qtyMode: "per_product" })}
              placeholder="e.g. 6"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {requirement.mode !== "any_category" && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground">
              {requirement.mode === "all" ? "Required SKUs" : "Approved list"}
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPasteOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <ClipboardPaste className="h-3.5 w-3.5" /> Paste from sheet
              </button>
              <button type="button" onClick={addRow} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Plus className="h-3.5 w-3.5" /> Add row
              </button>
            </div>
          </div>

          {pasteOpen && (
            <div className="mb-3 rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Paste rows copied from Excel or Google Sheets — one product per line.{" "}
                {requirement.mode === "all"
                  ? "Columns: code, name, shelf, qty."
                  : "Columns: code, name (shelf and quantity are set once, above)."}
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={
                  requirement.mode === "all"
                    ? "PA-1041\tAppy Fizz Apple 1L\t2 from top\t6\nPA-2210\tFrooti Mango 1.2L\t3 from top\t6"
                    : "PA-1041\tAppy Fizz Apple 1L\nPA-2210\tFrooti Mango 1.2L"
                }
                className="mt-2 h-24 w-full resize-y rounded-lg border border-transparent bg-input px-3 py-2 font-mono text-xs text-foreground focus:border-primary focus:bg-background focus:outline-none"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => { setPasteOpen(false); setPasteText(""); }} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyPaste}
                  disabled={!pasteText.trim()}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  Add pasted rows
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Code</th>
                  <th className="px-3 py-2 font-semibold">SKU</th>
                  {requirement.mode === "all" && (
                    <>
                      <th className="px-3 py-2 font-semibold">Shelf</th>
                      <th className="px-3 py-2 font-semibold">Qty</th>
                    </>
                  )}
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {skus.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5">
                      <input
                        value={s.skuCode}
                        onChange={(e) => patchRow(s.id, { skuCode: e.target.value })}
                        placeholder="Code"
                        className="w-full rounded-lg border border-transparent bg-input px-2 py-1.5 text-xs font-mono focus:border-primary focus:bg-background focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={s.skuName}
                        onChange={(e) => patchRow(s.id, { skuName: e.target.value })}
                        placeholder="Product name"
                        className="w-full rounded-lg border border-transparent bg-input px-2 py-1.5 text-xs focus:border-primary focus:bg-background focus:outline-none"
                      />
                    </td>
                    {requirement.mode === "all" && (
                      <>
                        <td className="px-2 py-1.5">
                          <input
                            value={s.shelf ?? ""}
                            onChange={(e) => patchRow(s.id, { shelf: e.target.value })}
                            placeholder="Shelf"
                            className="w-24 rounded-lg border border-transparent bg-input px-2 py-1.5 text-xs focus:border-primary focus:bg-background focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            value={s.qty ?? ""}
                            onChange={(e) => patchRow(s.id, { qty: e.target.value ? Number(e.target.value) : null })}
                            placeholder="Qty"
                            className="w-16 rounded-lg border border-transparent bg-input px-2 py-1.5 text-xs focus:border-primary focus:bg-background focus:outline-none"
                          />
                        </td>
                      </>
                    )}
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" onClick={() => removeRow(s.id)} aria-label="Remove" className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {skus.length === 0 && (
                  <tr>
                    <td colSpan={requirement.mode === "all" ? 5 : 3} className="p-6 text-center text-xs text-muted-foreground">
                      No SKUs yet — add a row.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
