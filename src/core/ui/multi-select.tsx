"use client";

import { useState } from "react";
import { Check, ChevronDown, X, Search } from "lucide-react";
import { cn } from "@/core/lib/utils";

export type MSOption = { id: string; label: string };

const PILL_COLLAPSE_THRESHOLD = 4;

/** A dropdown multi-select: removable pills (collapsed to count when many), searchable checklist, select-all. */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  emptyText = "No options",
  searchPlaceholder = "Search…",
  dropUp = false,
}: {
  options: MSOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  dropUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const remove = (id: string) => onChange(selected.filter((x) => x !== id));

  const selectedOpts = options.filter((o) => selected.includes(o.id));
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selected.includes(o.id));

  function selectAllFiltered() {
    const filteredIds = filtered.map((o) => o.id);
    const merged = [...new Set([...selected, ...filteredIds])];
    onChange(merged);
  }

  function deselectAllFiltered() {
    const filteredIds = new Set(filtered.map((o) => o.id));
    onChange(selected.filter((id) => !filteredIds.has(id)));
  }

  const collapsed = selectedOpts.length > PILL_COLLAPSE_THRESHOLD;

  return (
    <div className="relative">
      <div
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full cursor-pointer items-center gap-1.5 rounded-xl border border-transparent bg-input px-2.5 py-2 text-sm focus-within:border-primary"
      >
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {selectedOpts.length === 0 && (
            <span className="px-1.5 text-muted-foreground">{placeholder}</span>
          )}

          {/* Collapsed: single count chip */}
          {collapsed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {selectedOpts.length} selected
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                aria-label="Clear all"
                className="rounded-full hover:bg-primary/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {/* Expanded: individual pills */}
          {!collapsed &&
            selectedOpts.map((o) => (
              <span
                key={o.id}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {o.label}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(o.id);
                  }}
                  aria-label={`Remove ${o.label}`}
                  className="rounded-full hover:bg-primary/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className={cn("absolute z-20 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg", dropUp ? "bottom-full mb-1" : "mt-1")}>
            {/* Search row */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            {/* Select-all / clear bar */}
            {filtered.length > 1 && (
              <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                <span className="text-xs text-muted-foreground">
                  {filtered.length} {query.trim() ? "matching" : "total"}
                </span>
                <div className="flex items-center gap-3">
                  {!allFilteredSelected ? (
                    <button
                      type="button"
                      onClick={selectAllFiltered}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Select all
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={deselectAllFiltered}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Deselect all
                    </button>
                  )}
                  {selected.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange([])}
                      className="text-xs text-muted-foreground hover:text-danger hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Options list */}
            <div className="max-h-52 overflow-y-auto p-1">
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {options.length === 0 ? emptyText : "No matches"}
                </p>
              )}
              {filtered.map((o) => {
                const on = selected.includes(o.id);
                return (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => toggle(o.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate text-foreground">{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
