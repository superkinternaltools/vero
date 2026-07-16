"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2, Upload, Sliders, X } from "lucide-react";
import { Button } from "@/core/ui/button";
import { Input } from "@/core/ui/input";
import { Modal } from "@/core/ui/modal";
import { MultiSelect } from "@/core/ui/multi-select";
import { SelectSearch } from "@/core/ui/select-search";
import { cn } from "@/core/lib/utils";
import type { RosterRow, PresetRow, RosterGrid, ShiftMode, ShiftWindow } from "../types";
import type { AssignableUser } from "../queries";
import {
  createRoster,
  deleteRoster,
  addRosterMembers,
  removeRosterMember,
  upsertAssignment,
  clearAssignment,
  copyWeek,
  savePreset,
  deletePreset,
  validateBulk,
  applyBulk,
  type BulkRow,
  type BulkPreview,
} from "../actions";
import { AttendanceTabs } from "./attendance-tabs";

const selectClass =
  "w-full rounded-xl border border-transparent bg-input px-3 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none";

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmtDay(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
}

const CUSTOM = "__custom__";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // 0=Sun..6=Sat

/** Filter a person picker by role / department / store instead of hunting
 * through names one at a time — narrow with the filters, then either pick
 * individually below or add everyone who matched in one click. */
function PeoplePicker({
  users,
  roleOptions,
  deptOptions,
  storeOptions,
  selected,
  onChange,
}: {
  users: AssignableUser[];
  roleOptions: { id: string; label: string }[];
  deptOptions: { id: string; label: string }[];
  storeOptions: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [fRoles, setFRoles] = useState<string[]>([]);
  const [fDepts, setFDepts] = useState<string[]>([]);
  const [fStores, setFStores] = useState<string[]>([]);

  const hasFilter = fRoles.length > 0 || fDepts.length > 0 || fStores.length > 0;
  const filtered = users.filter((u) => {
    if (fRoles.length && !u.roleIds.some((id) => fRoles.includes(id))) return false;
    if (fDepts.length && !u.departmentIds.some((id) => fDepts.includes(id))) return false;
    if (fStores.length && !u.storeIds.some((id) => fStores.includes(id))) return false;
    return true;
  });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <MultiSelect options={roleOptions} selected={fRoles} onChange={setFRoles} placeholder="Role…" />
        <MultiSelect options={deptOptions} selected={fDepts} onChange={setFDepts} placeholder="Department…" />
        <MultiSelect options={storeOptions} selected={fStores} onChange={setFStores} placeholder="Store…" />
      </div>
      {hasFilter && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} match{filtered.length !== 1 ? "es" : ""}</span>
          <button
            type="button"
            onClick={() => onChange([...new Set([...selected, ...filtered.map((u) => u.id)])])}
            className="font-medium text-primary hover:underline"
          >
            + add all matching
          </button>
        </div>
      )}
      <MultiSelect
        options={(hasFilter ? filtered : users).map((u) => ({ id: u.id, label: u.name }))}
        selected={selected}
        onChange={onChange}
        placeholder="Add people…"
      />
    </div>
  );
}

export function RostersClient({
  rosters,
  presets,
  users,
  stores,
  roleOptions,
  deptOptions,
  grid,
  selectedRosterId,
}: {
  rosters: RosterRow[];
  presets: PresetRow[];
  users: AssignableUser[];
  stores: { id: string; label: string }[];
  roleOptions: { id: string; label: string }[];
  deptOptions: { id: string; label: string }[];
  grid: RosterGrid | null;
  selectedRosterId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // New-roster modal
  const [newOpen, setNewOpen] = useState(false);
  const [rName, setRName] = useState("");
  const [rStart, setRStart] = useState("");
  const [rEnd, setREnd] = useState("");
  const [rCap, setRCap] = useState("");
  const [rHolidayList, setRHolidayList] = useState<string[]>([]);
  const [rMembers, setRMembers] = useState<string[]>([]);
  const [rWorkDays, setRWorkDays] = useState<boolean[]>([false, true, true, true, true, true, true]); // Mon-Sat default
  const [rDefaultPresetId, setRDefaultPresetId] = useState("");
  const [rDefaultStoreId, setRDefaultStoreId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Presets modal
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pMode, setPMode] = useState<ShiftMode>("fixed");
  const [pWindows, setPWindows] = useState<ShiftWindow[]>([
    { label: "Check-in", start: "09:00", end: "09:30", graceMin: 15 },
    { label: "Check-out", start: "18:00", end: "18:30", graceMin: 0 },
  ]);
  const [pPunches, setPPunches] = useState("2");
  const [pMid, setPMid] = useState("0");
  const [pEditId, setPEditId] = useState<string | null>(null);

  // Add-members modal
  const [membersOpen, setMembersOpen] = useState(false);
  const [addIds, setAddIds] = useState<string[]>([]);

  // Cell editor
  const [cell, setCell] = useState<{ userId: string; name: string; date: string } | null>(null);
  const [cPreset, setCPreset] = useState<string>("");
  const [cStore, setCStore] = useState<string>("");
  const [cStart, setCStart] = useState("09:00");
  const [cEnd, setCEnd] = useState("18:00");
  const [cApplyRow, setCApplyRow] = useState(false);

  // Bulk modal
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [preview, setPreview] = useState<BulkPreview[] | null>(null);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);

  function openNew() {
    setRName(""); setRStart(""); setREnd(""); setRCap(""); setRHolidayList([]); setRMembers([]);
    setRWorkDays([false, true, true, true, true, true, true]);
    setRDefaultPresetId(""); setRDefaultStoreId(""); setErr(null);
    setNewOpen(true);
  }
  function submitNew() {
    setErr(null);
    start(async () => {
      const res = await createRoster({
        name: rName,
        startDate: rStart,
        endDate: rEnd,
        overtimeCapHours: rCap.trim() ? Number(rCap) : null,
        holidayDates: rHolidayList.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
        memberIds: rMembers,
        defaultPresetId: rDefaultPresetId || null,
        defaultStoreId: rDefaultStoreId || null,
        workingWeekdays: rWorkDays.flatMap((on, i) => (on ? [i] : [])),
      });
      if (res.error) { setErr(res.error); return; }
      setNewOpen(false);
      router.push(`/attendance/rosters?roster=${res.id}`);
    });
  }

  // presets
  function resetPresetForm() {
    setPName(""); setPMode("fixed");
    setPWindows([
      { label: "Check-in", start: "09:00", end: "09:30", graceMin: 15 },
      { label: "Check-out", start: "18:00", end: "18:30", graceMin: 0 },
    ]);
    setPPunches("2"); setPMid("0"); setPEditId(null);
  }
  function editPreset(p: PresetRow) {
    setPEditId(p.id); setPName(p.name); setPMode(p.mode);
    setPWindows(p.windows.length ? p.windows : [{ label: "Check-in", start: "09:00", end: "09:30", graceMin: 15 }]);
    setPPunches(String(p.punches || 2)); setPMid(String(p.midPhotoMin));
  }
  function savePresetForm() {
    start(async () => {
      const res = await savePreset({
        id: pEditId ?? undefined,
        name: pName,
        mode: pMode,
        windows: pWindows,
        punches: Number(pPunches) || 2,
        midPhotoMin: Number(pMid) || 0,
      });
      if (!res.error) { resetPresetForm(); router.refresh(); }
    });
  }

  // members
  function openCell(userId: string, name: string, date: string) {
    const existing = grid?.cells[userId]?.[date];
    setCell({ userId, name, date });
    setCPreset(existing?.presetId ?? (existing ? CUSTOM : ""));
    setCStore(existing?.storeId ?? (grid?.stores[0]?.id ?? ""));
    if (existing && existing.mode === "fixed" && existing.windows.length) {
      setCStart(existing.windows[0].start);
      setCEnd(existing.windows[existing.windows.length - 1].end);
    }
    setCApplyRow(false);
  }
  function saveCell() {
    if (!cell || !grid || !cStore || !cPreset) return;
    let mode: ShiftMode = "fixed";
    let windows: ShiftWindow[] = [];
    let presetId: string | null = null;
    let punches = 2;
    if (cPreset === CUSTOM) {
      windows = [
        { label: "Check-in", start: cStart, end: cStart, graceMin: 30 },
        { label: "Check-out", start: cEnd, end: cEnd, graceMin: 0 },
      ];
    } else {
      const p = presets.find((x) => x.id === cPreset);
      if (!p) return;
      mode = p.mode; windows = p.windows; presetId = p.id; punches = p.punches;
    }
    const dates = cApplyRow ? grid.days : [cell.date];
    start(async () => {
      for (const d of dates) {
        await upsertAssignment({
          rosterId: grid.roster.id, userId: cell.userId, workDate: d,
          presetId, mode, windows, punches, storeId: cStore,
        });
      }
      setCell(null);
      router.refresh();
    });
  }
  function copyLastWeek() {
    if (!grid) return;
    const fromWeek = addDaysISO(grid.weekStart, -7);
    if (!window.confirm(`Copy the week of ${fmtDay(fromWeek)} onto this week? This overwrites anything already set for this week.`)) return;
    start(async () => {
      const res = await copyWeek(grid.roster.id, fromWeek, grid.weekStart);
      if (res.error) { window.alert(res.error); return; }
      router.refresh();
    });
  }

  function clearCell() {
    if (!cell) return;
    start(async () => {
      await clearAssignment(cell.userId, cell.date);
      setCell(null);
      router.refresh();
    });
  }

  // bulk
  function runValidate() {
    if (!grid) return;
    const rows: BulkRow[] = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^employee\s*,/i.test(l))
      .map((l) => {
        const [employee = "", preset = "", store = "", weekdays = "", startD = "", endD = ""] = l.split(",").map((c) => c.trim());
        return { employee, preset, store, weekdays, start: startD, end: endD };
      });
    setBulkRows(rows);
    start(async () => {
      const res = await validateBulk(rows);
      setPreview(res.preview);
    });
  }
  function runApply() {
    if (!grid) return;
    start(async () => {
      await applyBulk(grid.roster.id, bulkRows.filter((_, i) => preview?.[i]?.ok));
      setBulkOpen(false); setBulkText(""); setPreview(null); setBulkRows([]);
      router.refresh();
    });
  }

  const memberIds = new Set((grid?.members ?? []).map((m) => m.userId));
  const addable = users.filter((u) => !memberIds.has(u.id));
  const allOk = preview != null && preview.every((p) => p.ok) && preview.length > 0;

  return (
    <div>
      <AttendanceTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Attendance rosters</h1>
          <p className="mt-1 text-sm text-muted-foreground">Who punches, on which days, at which store.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="md" onClick={() => { resetPresetForm(); setPresetsOpen(true); }}>
            <Sliders className="h-4 w-4" /> Shift presets
          </Button>
          <Button size="md" onClick={openNew}>
            <Plus className="h-4 w-4" /> New roster
          </Button>
        </div>
      </div>

      {/* Roster chips */}
      <div className="mt-5 flex flex-wrap gap-2">
        {rosters.map((r) => (
          <button
            key={r.id}
            onClick={() => router.push(`/attendance/rosters?roster=${r.id}`)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              selectedRosterId === r.id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:border-muted-foreground hover:text-foreground",
            )}
          >
            {r.name} <span className="opacity-60">· {r.memberCount}</span>
          </button>
        ))}
        {rosters.length === 0 && <p className="text-sm text-muted-foreground">No rosters yet — create your first.</p>}
      </div>

      {/* Grid */}
      {grid && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-border bg-input px-2 py-1.5">
                <button onClick={() => router.push(`/attendance/rosters?roster=${grid.roster.id}&week=${addDaysISO(grid.weekStart, -7)}`)} className="rounded p-1 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
                <span className="min-w-[110px] text-center text-sm font-medium">Week of {fmtDay(grid.weekStart)}</span>
                <button onClick={() => router.push(`/attendance/rosters?roster=${grid.roster.id}&week=${addDaysISO(grid.weekStart, 7)}`)} className="rounded p-1 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
              </div>
              {grid.roster.overtimeCapHours != null && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">OT cap {grid.roster.overtimeCapHours}h</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="md" onClick={copyLastWeek} disabled={pending}>
                <Copy className="h-4 w-4" /> Copy last week
              </Button>
              <Button variant="outline" size="md" onClick={() => { setAddIds([]); setMembersOpen(true); }}>
                <Plus className="h-4 w-4" /> Add people
              </Button>
              <Button variant="outline" size="md" onClick={() => { setBulkText(""); setPreview(null); setBulkOpen(true); }}>
                <Upload className="h-4 w-4" /> Bulk upload
              </Button>
              <Button variant="ghost" size="md" onClick={() => {
                if (!window.confirm(`Delete roster "${grid.roster.name}"?`)) return;
                start(async () => { await deleteRoster(grid.roster.id); router.push("/attendance/rosters"); });
              }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card p-2">
            <table className="border-separate" style={{ borderSpacing: 4 }}>
              <thead>
                <tr>
                  <th className="px-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Person</th>
                  {grid.days.map((d) => (
                    <th key={d} className="px-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fmtDay(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.members.map((m) => (
                  <tr key={m.userId}>
                    <td className="whitespace-nowrap pr-2 text-sm font-medium text-foreground">
                      <span className="inline-flex items-center gap-1">
                        {m.name}
                        <button
                          onClick={() => {
                            if (!window.confirm(`Remove ${m.name} from this roster?`)) return;
                            start(async () => { await removeRosterMember(grid.roster.id, m.userId); router.refresh(); });
                          }}
                          className="rounded p-0.5 text-muted-foreground hover:text-danger"
                          aria-label="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </td>
                    {grid.days.map((d) => {
                      const c = grid.cells[m.userId]?.[d];
                      return (
                        <td key={d} className="align-top">
                          <button
                            onClick={() => openCell(m.userId, m.name, d)}
                            className={cn(
                              "h-full min-w-[92px] rounded-lg border p-1.5 text-left transition-colors",
                              c ? "border-border bg-primary/5 hover:border-primary/50" : "border-dashed border-border text-muted-foreground hover:border-muted-foreground",
                            )}
                          >
                            {c ? (
                              <>
                                <div className="text-xs font-semibold text-foreground">{c.label}</div>
                                <div className="text-[11px] text-muted-foreground">{c.storeName}</div>
                              </>
                            ) : (
                              <div className="text-xs">Off</div>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {grid.members.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">No people on this roster yet — add some.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Click a cell to set a shift, pick a store, or mark off. Presets and bulk upload keep it fast.</p>
        </div>
      )}

      {!grid && rosters.length > 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">Pick a roster above to edit its grid.</p>
      )}

      {/* New roster modal */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New roster">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Name</label>
            <Input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="e.g. Kondapur Qcomm — July" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="text-sm font-medium text-foreground">Start date</label><Input type="date" value={rStart} onChange={(e) => setRStart(e.target.value)} /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium text-foreground">End date</label><Input type="date" value={rEnd} onChange={(e) => setREnd(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Overtime cap (hours)</label>
            <Input type="number" value={rCap} onChange={(e) => setRCap(e.target.value)} placeholder="blank = uncapped" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Holidays</label>
            <div className="space-y-1.5">
              {rHolidayList.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={d}
                    onChange={(e) => setRHolidayList((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <button
                    type="button"
                    onClick={() => setRHolidayList((list) => list.filter((_, j) => j !== i))}
                    className="rounded p-1.5 text-muted-foreground hover:text-danger"
                    aria-label="Remove holiday"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRHolidayList((list) => [...list, ""])}
                className="text-sm font-medium text-primary hover:underline"
              >
                + add a holiday
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">People</label>
            <PeoplePicker
              users={users}
              roleOptions={roleOptions}
              deptOptions={deptOptions}
              storeOptions={stores}
              selected={rMembers}
              onChange={setRMembers}
            />
          </div>

          <div className="rounded-xl border border-border p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Default schedule</p>
              <p className="text-xs text-muted-foreground">
                Pre-fills the grid for these people on their working days. Leave the shift blank to start
                with an empty grid instead — you can always build it by hand or bulk upload afterward.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Working days</label>
              <div className="flex gap-1.5">
                {WEEKDAY_LABELS.map((lbl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setRWorkDays((wd) => wd.map((v, j) => (j === i ? !v : v)))}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                      rWorkDays[i] ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                    )}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Default shift</label>
                <SelectSearch
                  value={rDefaultPresetId || null}
                  onChange={(v) => setRDefaultPresetId(v ?? "")}
                  options={presets.map((p) => ({ id: p.id, label: `${p.name} (${p.mode})` }))}
                  placeholder="None — leave empty"
                  emptyText="No presets yet — add one in Shift presets."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Store</label>
                <SelectSearch
                  value={rDefaultStoreId || null}
                  onChange={(v) => setRDefaultStoreId(v ?? "")}
                  options={stores}
                  placeholder="Pick a store…"
                />
              </div>
            </div>
          </div>

          {err && <p className="text-sm font-medium text-danger">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="md" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button size="md" onClick={submitNew} disabled={pending}>{pending ? "Creating…" : "Create"}</Button>
          </div>
        </div>
      </Modal>

      {/* Add members modal */}
      <Modal open={membersOpen} onClose={() => setMembersOpen(false)} title="Add people to roster">
        <div className="space-y-4">
          <PeoplePicker
            users={addable}
            roleOptions={roleOptions}
            deptOptions={deptOptions}
            storeOptions={stores}
            selected={addIds}
            onChange={setAddIds}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="md" onClick={() => setMembersOpen(false)}>Cancel</Button>
            <Button size="md" disabled={pending || !addIds.length} onClick={() => {
              start(async () => { await addRosterMembers(grid!.roster.id, addIds); setMembersOpen(false); router.refresh(); });
            }}>Add</Button>
          </div>
        </div>
      </Modal>

      {/* Cell editor modal */}
      <Modal open={!!cell} onClose={() => setCell(null)} title={cell ? `${cell.name} · ${fmtDay(cell.date)}` : ""}>
        {cell && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Shift</label>
              <SelectSearch
                value={cPreset || null}
                onChange={(v) => setCPreset(v ?? "")}
                options={[...presets.map((p) => ({ id: p.id, label: `${p.name} (${p.mode})` })), { id: CUSTOM, label: "Custom time…" }]}
                placeholder="Pick a shift…"
              />
            </div>
            {cPreset === CUSTOM && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="text-sm font-medium text-foreground">Start</label><Input type="time" value={cStart} onChange={(e) => setCStart(e.target.value)} /></div>
                <div className="space-y-1.5"><label className="text-sm font-medium text-foreground">End</label><Input type="time" value={cEnd} onChange={(e) => setCEnd(e.target.value)} /></div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Store</label>
              <SelectSearch value={cStore || null} onChange={(v) => setCStore(v ?? "")} options={grid?.stores ?? []} placeholder="Pick a store…" />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={cApplyRow} onChange={(e) => setCApplyRow(e.target.checked)} className="h-4 w-4 rounded accent-primary" />
              Apply to this person&apos;s whole week
            </label>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="md" onClick={clearCell} disabled={pending}>Mark off</Button>
              <div className="flex gap-2">
                <Button variant="outline" size="md" onClick={() => setCell(null)}>Cancel</Button>
                <Button size="md" onClick={saveCell} disabled={pending || !cPreset || !cStore}>Save</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Presets modal */}
      <Modal open={presetsOpen} onClose={() => setPresetsOpen(false)} title="Shift presets">
        <div className="space-y-5">
          {presets.length > 0 && (
            <div className="space-y-2">
              {presets.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-foreground">{p.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {p.mode === "open" ? `open · ${p.punches} punches` : p.windows.map((w) => `${w.start}–${w.end}`).join(", ")}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => editPreset(p)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground text-xs">Edit</button>
                    <button onClick={() => start(async () => { await deletePreset(p.id); router.refresh(); })} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-border p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">{pEditId ? "Edit preset" : "New preset"}</p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="e.g. Morning" />
            </div>
            <div className="flex gap-2">
              {(["fixed", "open"] as ShiftMode[]).map((m) => (
                <button key={m} onClick={() => setPMode(m)} className={cn("flex-1 rounded-lg border px-3 py-2 text-sm", pMode === m ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground")}>
                  {m === "fixed" ? "Fixed windows" : "Open check-in/out"}
                </button>
              ))}
            </div>

            {pMode === "fixed" ? (
              <div className="space-y-2">
                {pWindows.map((w, i) => (
                  <div key={i} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">Window label</label>
                      <button onClick={() => setPWindows((ws) => ws.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:text-danger"><X className="h-4 w-4" /></button>
                    </div>
                    <input value={w.label} onChange={(e) => setPWindows((ws) => ws.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className={cn(selectClass, "mb-2")} placeholder="e.g. Check-in" />
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Start time</label>
                        <input type="time" value={w.start} onChange={(e) => setPWindows((ws) => ws.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} className={selectClass} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">End time</label>
                        <input type="time" value={w.end} onChange={(e) => setPWindows((ws) => ws.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} className={selectClass} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Grace (min)</label>
                        <input type="number" value={w.graceMin} onChange={(e) => setPWindows((ws) => ws.map((x, j) => j === i ? { ...x, graceMin: Number(e.target.value) } : x))} className={selectClass} />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => setPWindows((ws) => [...ws, { label: "Window", start: "09:00", end: "09:30", graceMin: 0 }])} className="text-sm font-medium text-primary hover:underline">+ add window</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Punches per day</label>
                <Input type="number" value={pPunches} onChange={(e) => setPPunches(e.target.value)} />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Required mid-shift photos</label>
              <Input type="number" value={pMid} onChange={(e) => setPMid(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2">
              {pEditId && <Button variant="outline" size="md" onClick={resetPresetForm}>New</Button>}
              <Button size="md" onClick={savePresetForm} disabled={pending || !pName.trim()}>{pEditId ? "Save" : "Create"}</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Bulk upload modal */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk upload roster">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            One row per work pattern, comma-separated:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">employee, preset, store, weekdays, start, end</code>.
            Preset is a preset name or a time like <code className="rounded bg-muted px-1.5 py-0.5 text-xs">22:00-06:00</code>. Weekdays like <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Mon,Tue,Wed</code>.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => { setBulkText(e.target.value); setPreview(null); }}
            rows={6}
            placeholder="ravi.k@superk.in, Morning, SK-Kondapur, Mon,Tue,Wed,Sat, 2026-07-01, 2026-07-31"
            className="w-full rounded-xl border border-transparent bg-input px-3 py-2.5 font-mono text-xs text-foreground focus:border-primary focus:bg-card focus:outline-none resize-y"
          />
          {preview && (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Preset</th><th className="px-3 py-2">Store</th><th className="px-3 py-2">Status</th></tr></thead>
                <tbody>
                  {preview.map((p) => (
                    <tr key={p.index} className={cn("border-b border-border last:border-0", !p.ok && "bg-danger/5")}>
                      <td className="px-3 py-2">{p.employee}</td>
                      <td className="px-3 py-2">{p.preset}</td>
                      <td className="px-3 py-2">{p.store}</td>
                      <td className="px-3 py-2">{p.ok ? <span className="text-success">OK</span> : <span className="text-danger">{p.error}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="md" onClick={() => setBulkOpen(false)}>Cancel</Button>
            {!preview ? (
              <Button size="md" onClick={runValidate} disabled={pending || !bulkText.trim()}>Preview</Button>
            ) : (
              <Button size="md" onClick={runApply} disabled={pending || !allOk}>{allOk ? "Confirm import" : "Fix errors first"}</Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
