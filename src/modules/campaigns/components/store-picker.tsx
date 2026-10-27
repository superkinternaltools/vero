"use client";

import { useState } from "react";
import { Search, X, Check, ClipboardPaste } from "lucide-react";
import { cn } from "@/core/lib/utils";

export function StorePicker({
  options,
  selected,
  onChange,
}: {
  options: { id: string; label: string; name?: string; closed?: boolean; aligned?: boolean }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [leftSearch, setLeftSearch] = useState("");
  const [rightSearch, setRightSearch] = useState("");
  const [onlyAligned, setOnlyAligned] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const selectedSet = new Set(selected);

  const available = options.filter((o) => !selectedSet.has(o.id));
  const assigned  = options.filter((o) => selectedSet.has(o.id));

  // The same filters feed the list and "Add all", so Add all only adds what's shown.
  const leftFiltered = leftSearch.trim() !== "" || onlyAligned || onlyActive;
  const filteredAvailable = available.filter(
    (o) =>
      o.label.toLowerCase().includes(leftSearch.toLowerCase()) &&
      (!onlyAligned || o.aligned === true) &&
      (!onlyActive || o.closed !== true),
  );
  const filteredAssigned = assigned.filter((o) =>
    o.label.toLowerCase().includes(rightSearch.toLowerCase()),
  );

  function add(id: string) {
    onChange([...selected, id]);
  }

  function remove(id: string) {
    onChange(selected.filter((x) => x !== id));
  }

  // After a bulk add (Add all / Paste names), trim the assigned set down to
  // aligned and/or active stores. Only stores we can see in the assigned list
  // are judged — each button can be used on its own or one after the other.
  const notAligned = assigned.filter((o) => o.aligned === false);
  const notActive = assigned.filter((o) => o.closed === true);

  function keepOnly(drop: { id: string }[]) {
    const dropSet = new Set(drop.map((o) => o.id));
    onChange(selected.filter((id) => !dropSet.has(id)));
  }

  function addAllFiltered() {
    const ids = filteredAvailable.map((o) => o.id);
    onChange([...new Set([...selected, ...ids])]);
  }

  // Paste mode: parse names from pasted text (first tab-separated column per line).
  // Matches against the full "code — name" label OR the plain store name alone —
  // so a paste of bare store names (no code) still maps to the right store. If a
  // bare name matches more than one store (name collision), it's left out of the
  // auto-add and flagged separately rather than silently adding every match.
  function matchesPasted(o: { label: string; name?: string }, n: string): boolean {
    const needle = n.toLowerCase();
    return o.label.toLowerCase() === needle || (!!o.name && o.name.toLowerCase() === needle);
  }
  const pasteNames = pasteText
    .split("\n")
    .map((line) => line.split("\t")[0].trim())
    .filter(Boolean);
  const pasteNameMatches = pasteNames.map((n) => ({ name: n, matches: options.filter((o) => matchesPasted(o, n)) }));
  const pasteMatched = pasteNameMatches.filter((m) => m.matches.length === 1).map((m) => m.matches[0]);
  const pasteAmbiguous = pasteNameMatches.filter((m) => m.matches.length > 1).map((m) => m.name);
  const pasteNotFound = pasteNameMatches.filter((m) => m.matches.length === 0).map((m) => m.name);

  function applyPaste() {
    const ids = pasteMatched.map((o) => o.id);
    onChange([...new Set([...selected, ...ids])]);
    setPasteMode(false);
    setPasteText("");
  }

  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border">
      {/* ── Left: available / paste ── */}
      <div className="border-r border-border">
        <div className="border-b border-border bg-muted/20 px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Available ({leftFiltered ? `${filteredAvailable.length} of ${available.length}` : available.length})
            </span>
            <div className="flex items-center gap-2">
              {!pasteMode && filteredAvailable.length > 0 && (
                <button
                  type="button"
                  onClick={addAllFiltered}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Add {leftFiltered ? `${filteredAvailable.length} matching` : "all"}
                </button>
              )}
              <button
                type="button"
                onClick={() => { setPasteMode((p) => !p); setPasteText(""); }}
                className={cn(
                  "flex items-center gap-1 text-xs font-medium hover:underline",
                  pasteMode ? "text-muted-foreground" : "text-primary",
                )}
              >
                <ClipboardPaste className="h-3 w-3" />
                {pasteMode ? "Cancel" : "Paste names"}
              </button>
            </div>
          </div>
          {!pasteMode && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Show only:</span>
              <FilterChip label="Aligned stores" on={onlyAligned} onToggle={() => setOnlyAligned((v) => !v)} />
              <FilterChip label="Active stores" on={onlyActive} onToggle={() => setOnlyActive((v) => !v)} />
            </div>
          )}
          {!pasteMode && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={leftSearch}
                onChange={(e) => setLeftSearch(e.target.value)}
                placeholder="Search stores…"
                className="w-full rounded-lg bg-card py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          )}
        </div>

        {pasteMode ? (
          <div className="flex h-64 flex-col p-3">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"Paste store names from Google Sheets or CSV\n(one name per line)"}
              className="flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            {pasteNames.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-success">{pasteMatched.length} matched</span>
                  {pasteAmbiguous.length > 0 && (
                    <span className="text-warning">
                      {", "}
                      {pasteAmbiguous.length} ambiguous (matches more than one store — add manually):{" "}
                      <span className="italic">{pasteAmbiguous.slice(0, 3).join(", ")}{pasteAmbiguous.length > 3 ? ` +${pasteAmbiguous.length - 3} more` : ""}</span>
                    </span>
                  )}
                  {pasteNotFound.length > 0 && (
                    <span className="text-danger">
                      {", "}
                      {pasteNotFound.length} not found:{" "}
                      <span className="italic">{pasteNotFound.slice(0, 3).join(", ")}{pasteNotFound.length > 3 ? ` +${pasteNotFound.length - 3} more` : ""}</span>
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={applyPaste}
                  disabled={pasteMatched.length === 0}
                  className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40 hover:opacity-90"
                >
                  Add {pasteMatched.length} matched store{pasteMatched.length !== 1 ? "s" : ""}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="h-64 overflow-y-auto p-1">
            {filteredAvailable.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                {available.length === 0 ? "All stores have been assigned." : "No stores match your search or filters."}
              </p>
            ) : (
              filteredAvailable.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => add(o.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="flex h-4 w-4 shrink-0 rounded border border-border" />
                  <span className="truncate text-sm text-foreground">{o.label}</span>
                  {o.closed && (
                    <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Closed
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Right: assigned ── */}
      <div>
        <div className="border-b border-border bg-muted/20 px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Assigned
              {selected.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {selected.length}
                </span>
              )}
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className={cn(
                  "text-xs font-medium text-muted-foreground hover:text-danger hover:underline",
                )}
              >
                Clear all
              </button>
            )}
          </div>
          {selected.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Keep only:</span>
              <KeepOnlyButton label="Aligned stores" removing={notAligned.length} onClick={() => keepOnly(notAligned)} />
              <KeepOnlyButton label="Active stores" removing={notActive.length} onClick={() => keepOnly(notActive)} />
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={rightSearch}
              onChange={(e) => setRightSearch(e.target.value)}
              placeholder="Search assigned…"
              className="w-full rounded-lg bg-card py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        </div>
        <div className="h-64 overflow-y-auto p-1">
          {selected.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No stores assigned yet — click stores on the left to add them.
            </p>
          ) : filteredAssigned.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">No assigned stores match your search.</p>
          ) : (
            filteredAssigned.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-muted"
              >
                <Check className="h-4 w-4 shrink-0 text-success" />
                <span className="flex-1 truncate text-sm text-foreground">{o.label}</span>
                {o.closed && (
                  <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">
                    Closed
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(o.id)}
                  aria-label={`Remove ${o.label}`}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function KeepOnlyButton({ label, removing, onClick }: { label: string; removing: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={removing === 0}
      title={removing === 0 ? "Everything assigned already matches" : `Removes ${removing} store${removing === 1 ? "" : "s"} that don't match`}
      className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-default disabled:opacity-50 disabled:hover:border-border disabled:hover:text-foreground"
    >
      {label}
      {removing > 0 && <span className="ml-1 text-muted-foreground">(−{removing})</span>}
    </button>
  );
}

function FilterChip({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:border-primary",
      )}
    >
      {label}
    </button>
  );
}
