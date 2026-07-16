"use client";

import { useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/core/lib/utils";

export type SelectSearchOption = { id: string; label: string };

/** A single-select dropdown with a search box to filter long option lists. */
export function SelectSearch({
  options,
  value,
  onChange,
  placeholder = "Select…",
  emptyText = "No options",
  searchPlaceholder = "Search…",
}: {
  options: SelectSearchOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOpt = options.find((o) => o.id === value) ?? null;
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative">
      <div
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full cursor-pointer items-center gap-1.5 rounded-xl border border-transparent bg-input px-3 py-2 text-sm focus-within:border-primary"
      >
        <span className={cn("flex-1 truncate", !selectedOpt && "text-muted-foreground")}>
          {selectedOpt?.label ?? placeholder}
        </span>
        {selectedOpt && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            aria-label="Clear selection"
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
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

            <div className="max-h-72 overflow-y-auto p-1">
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {options.length === 0 ? emptyText : "No matches"}
                </p>
              )}
              {filtered.map((o) => {
                const on = o.id === value;
                return (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => pick(o.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
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
