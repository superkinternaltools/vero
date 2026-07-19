"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Trash2, Sliders, Upload, X } from "lucide-react";
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
  updateRoster,
  deleteRoster,
  addRosterMembers,
  removeRosterMember,
  upsertAssignment,
  clearAssignment,
  applyWeek,
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
function fmtDayShort(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short" });
}

/** Every calendar month the roster spans, for the month switcher. */
function monthOptions(startDate: string, endDate: string): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  let d = new Date(startDate.slice(0, 7) + "-01T00:00:00Z");
  const end = new Date(endDate.slice(0, 7) + "-01T00:00:00Z");
  while (d.getTime() <= end.getTime()) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    opts.push({
      value: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
    });
    d = new Date(Date.UTC(y, m + 1, 1));
  }
  return opts;
}

const CUSTOM = "__custom__";

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
  const isNew = selectedRosterId === "new";

  // ── Creation form (a bare roster only — the calendar is built afterward
  // on this same page, once a real roster id exists). ──────────────────────
  const [rName, setRName] = useState("");
  const [rStart, setRStart] = useState("");
  const [rEnd, setREnd] = useState("");
  const [rCap, setRCap] = useState("");
  const [rHolidayList, setRHolidayList] = useState<string[]>([]);
  const [rMembers, setRMembers] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

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
      });
      if (res.error) { setErr(res.error); return; }
      router.push(`/attendance/rosters?roster=${res.id}`);
    });
  }

  // ── Roster details (existing roster) — resyncs whenever a different
  // roster is loaded. ───────────────────────────────────────────────────────
  const [dName, setDName] = useState("");
  const [dStart, setDStart] = useState("");
  const [dEnd, setDEnd] = useState("");
  const [dCap, setDCap] = useState("");
  const [dHolidayList, setDHolidayList] = useState<string[]>([]);

  useEffect(() => {
    if (!grid) return;
    setDName(grid.roster.name);
    setDStart(grid.roster.startDate);
    setDEnd(grid.roster.endDate);
    setDCap(grid.roster.overtimeCapHours != null ? String(grid.roster.overtimeCapHours) : "");
    setDHolidayList(grid.roster.holidayDates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid?.roster.id]);

  function saveDetails() {
    if (!grid) return;
    start(async () => {
      await updateRoster(grid.roster.id, {
        name: dName,
        startDate: dStart,
        endDate: dEnd,
        overtimeCapHours: dCap.trim() ? Number(dCap) : null,
        holidayDates: dHolidayList.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      });
      router.refresh();
    });
  }

  // ── People (existing roster) ─────────────────────────────────────────────
  const [addIds, setAddIds] = useState<string[]>([]);
  const memberIds = new Set((grid?.members ?? []).map((m) => m.userId));
  const addable = users.filter((u) => !memberIds.has(u.id));

  function addSelectedMembers() {
    if (!grid || !addIds.length) return;
    start(async () => {
      await addRosterMembers(grid.roster.id, addIds);
      setAddIds([]);
      router.refresh();
    });
  }
  function removeMember(userId: string, name: string) {
    if (!grid) return;
    if (!window.confirm(`Remove ${name} from this roster?`)) return;
    start(async () => {
      await removeRosterMember(grid.roster.id, userId);
      router.refresh();
    });
  }

  // ── Calendar (existing roster) ───────────────────────────────────────────
  const [expandedPersons, setExpandedPersons] = useState<Set<string>>(new Set());
  function togglePerson(userId: string) {
    setExpandedPersons((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  function changeMonth(value: string) {
    if (!grid) return;
    router.push(`/attendance/rosters?roster=${grid.roster.id}&month=${value}`);
  }

  // Per-(person, week) "same all week" quick-set values.
  const [weekPreset, setWeekPreset] = useState<Record<string, string>>({});
  const [weekStore, setWeekStore] = useState<Record<string, string>>({});
  function weekKey(userId: string, weekStart: string) {
    return `${userId}|${weekStart}`;
  }
  function applyWeekFor(userId: string, weekStartDate: string) {
    if (!grid) return;
    const key = weekKey(userId, weekStartDate);
    const presetId = weekPreset[key];
    const storeId = weekStore[key];
    if (!presetId || !storeId) return;
    start(async () => {
      await applyWeek({ rosterId: grid.roster.id, userId, weekStart: weekStartDate, presetId, storeId });
      router.refresh();
    });
  }
  function copyToNextWeek(weekStartDate: string) {
    if (!grid) return;
    const nextWeek = addDaysISO(weekStartDate, 7);
    if (!window.confirm(`Copy the week of ${fmtDay(weekStartDate)} onto the week of ${fmtDay(nextWeek)}? This overwrites anything already set for that week.`)) return;
    start(async () => {
      const res = await copyWeek(grid.roster.id, weekStartDate, nextWeek);
      if (res.error) { window.alert(res.error); return; }
      router.refresh();
    });
  }

  // Inline day editor — appears below whichever week contains the day being edited.
  const [editingCell, setEditingCell] = useState<{ userId: string; date: string } | null>(null);
  const [cePreset, setCePreset] = useState("");
  const [ceStore, setCeStore] = useState("");
  const [ceStart, setCeStart] = useState("09:00");
  const [ceEnd, setCeEnd] = useState("18:00");

  function openDayEditor(userId: string, date: string) {
    const existing = grid?.cells[userId]?.[date] ?? [];
    setEditingCell({ userId, date });
    setCePreset("");
    setCeStore(existing[0]?.storeId ?? grid?.stores[0]?.id ?? "");
    setCeStart("09:00");
    setCeEnd("18:00");
  }
  function editExistingShift(userId: string, date: string, presetId: string | null, storeId: string, mode: ShiftMode, windows: ShiftWindow[]) {
    setEditingCell({ userId, date });
    setCePreset(presetId ?? CUSTOM);
    setCeStore(storeId);
    if (mode === "fixed" && windows.length) {
      setCeStart(windows[0].start);
      setCeEnd(windows[windows.length - 1].end);
    }
  }
  function saveDayEditor() {
    if (!editingCell || !grid || !cePreset || !ceStore) return;
    let mode: ShiftMode = "fixed";
    let windows: ShiftWindow[] = [];
    let presetId: string | null = null;
    let punches = 2;
    if (cePreset === CUSTOM) {
      windows = [
        { label: "Check-in", start: ceStart, end: ceStart, graceMin: 30 },
        { label: "Check-out", start: ceEnd, end: ceEnd, graceMin: 0 },
      ];
    } else {
      const p = presets.find((x) => x.id === cePreset);
      if (!p) return;
      mode = p.mode; windows = p.windows; presetId = p.id; punches = p.punches;
    }
    start(async () => {
      await upsertAssignment({
        rosterId: grid.roster.id, userId: editingCell.userId, workDate: editingCell.date,
        presetId, mode, windows, punches, storeId: ceStore,
      });
      setEditingCell(null);
      router.refresh();
    });
  }
  function removeShift(assignmentId: string) {
    start(async () => {
      await clearAssignment(assignmentId);
      router.refresh();
    });
  }

  // ── Shift presets modal ───────────────────────────────────────────────────
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

  // ── Bulk upload modal ─────────────────────────────────────────────────────
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [preview, setPreview] = useState<BulkPreview[] | null>(null);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);

  function runValidate() {
    if (!grid) return;
    const rows: BulkRow[] = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^employee\s*,/i.test(l))
      .map((l) => {
        // Weekdays and the row's own field separator are both commas, so a
        // naturally-typed "Tue, Wed, Thu" would otherwise shove Wed/Thu into
        // the date slots. Dates are always the last two fields and
        // employee/preset/store are always the first three, so everything
        // in between — however many comma-separated weekdays — is the
        // weekdays field.
        const parts = l.split(",").map((c) => c.trim());
        const employee = parts[0] ?? "";
        const preset = parts[1] ?? "";
        const store = parts[2] ?? "";
        const endD = parts[parts.length - 1] ?? "";
        const startD = parts[parts.length - 2] ?? "";
        const weekdays = parts.slice(3, Math.max(3, parts.length - 2)).join(",");
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
          {!isNew && (
            <Button size="md" onClick={() => router.push("/attendance/rosters?roster=new")}>
              <Plus className="h-4 w-4" /> New roster
            </Button>
          )}
        </div>
      </div>

      {/* Roster picker */}
      {rosters.length > 0 ? (
        <div className="mt-5 w-full max-w-sm">
          <SelectSearch
            value={selectedRosterId !== "new" ? selectedRosterId : null}
            onChange={(id) => router.push(id ? `/attendance/rosters?roster=${id}` : "/attendance/rosters")}
            options={rosters.map((r) => ({ id: r.id, label: `${r.name} · ${r.memberCount}` }))}
            placeholder="Pick a roster…"
            searchPlaceholder="Search rosters…"
          />
        </div>
      ) : (
        !isNew && <p className="mt-5 text-sm text-muted-foreground">No rosters yet — create your first.</p>
      )}

      {/* Creation form */}
      {isNew && (
        <div className="mt-6 max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Roster name</label>
            <Input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="e.g. Kondapur Qcomm — Q3" />
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
            {rHolidayList.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input type="date" value={d} onChange={(e) => setRHolidayList((list) => list.map((x, j) => (j === i ? e.target.value : x)))} />
                <button type="button" onClick={() => setRHolidayList((list) => list.filter((_, j) => j !== i))} className="rounded p-1.5 text-muted-foreground hover:text-danger" aria-label="Remove holiday">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setRHolidayList((list) => [...list, ""])} className="text-sm font-medium text-primary hover:underline">
              + add a holiday
            </button>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">People (optional — add more later)</label>
            <PeoplePicker users={users} roleOptions={roleOptions} deptOptions={deptOptions} storeOptions={stores} selected={rMembers} onChange={setRMembers} />
          </div>
          {err && <p className="text-sm font-medium text-danger">{err}</p>}
          <p className="text-xs text-muted-foreground">Who visits which store on which day gets set up on the next page, once the roster exists.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="md" onClick={() => router.push("/attendance/rosters")}>Cancel</Button>
            <Button size="md" onClick={submitNew} disabled={pending || !rName.trim() || !rStart || !rEnd}>{pending ? "Creating…" : "Create roster"}</Button>
          </div>
        </div>
      )}

      {/* Existing roster: details + people + calendar */}
      {grid && (
        <div className="mt-6 space-y-6">
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Roster details</h2>
              <Button variant="ghost" size="md" onClick={() => {
                if (!window.confirm(`Delete roster "${grid.roster.name}"?`)) return;
                start(async () => { await deleteRoster(grid.roster.id); router.push("/attendance/rosters"); });
              }}>
                <Trash2 className="h-4 w-4" /> Delete roster
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="space-y-1.5 md:col-span-2"><label className="text-sm font-medium text-foreground">Name</label><Input value={dName} onChange={(e) => setDName(e.target.value)} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-foreground">Start date</label><Input type="date" value={dStart} onChange={(e) => setDStart(e.target.value)} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-foreground">End date</label><Input type="date" value={dEnd} onChange={(e) => setDEnd(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="text-sm font-medium text-foreground">Overtime cap (hours)</label><Input type="number" value={dCap} onChange={(e) => setDCap(e.target.value)} placeholder="blank = uncapped" /></div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Holidays</label>
                <div className="flex flex-wrap gap-1.5">
                  {dHolidayList.map((d, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      {d || "—"}
                      <button onClick={() => setDHolidayList((list) => list.filter((_, j) => j !== i))} aria-label="Remove holiday"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  <button type="button" onClick={() => setDHolidayList((list) => [...list, ""])} className="text-xs font-medium text-primary hover:underline">+ add</button>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="md" onClick={saveDetails} disabled={pending}>Save details</Button>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">People</h2>
            <div className="flex items-end gap-2">
              <div className="flex-1"><PeoplePicker users={addable} roleOptions={roleOptions} deptOptions={deptOptions} storeOptions={stores} selected={addIds} onChange={setAddIds} /></div>
              <Button size="md" onClick={addSelectedMembers} disabled={pending || !addIds.length}>Add</Button>
            </div>
            {grid.members.length > 0 && (
              <div className="divide-y divide-border rounded-xl border border-border">
                {grid.members.map((m) => (
                  <div key={m.userId} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium text-foreground">{m.name}</span>
                    <button onClick={() => removeMember(m.userId, m.name)} className="rounded p-1 text-muted-foreground hover:text-danger" aria-label="Remove">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Calendar</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={grid.monthKey}
                  onChange={(e) => changeMonth(e.target.value)}
                  className="rounded-xl border border-transparent bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
                >
                  {monthOptions(grid.roster.startDate, grid.roster.endDate).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {grid.roster.overtimeCapHours != null && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">OT cap {grid.roster.overtimeCapHours}h</span>
                )}
                <Button variant="outline" size="md" onClick={() => { setBulkText(""); setPreview(null); setBulkOpen(true); }}>
                  <Upload className="h-4 w-4" /> Bulk upload
                </Button>
              </div>
            </div>

            {grid.members.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Add people above to start scheduling.</p>
            )}

            {grid.members.map((m) => {
              const expanded = expandedPersons.has(m.userId);
              return (
                <div key={m.userId} className="overflow-hidden rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => togglePerson(m.userId)}
                    className={cn("flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40", expanded && "border-b border-border")}
                  >
                    <span className="text-sm font-medium text-foreground">{m.name}</span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                  </button>

                  {expanded && (
                    <div className="space-y-4 p-4">
                      {grid.weekStarts.map((ws) => {
                        const weekDates = Array.from({ length: 7 }, (_, i) => addDaysISO(ws, i));
                        const key = weekKey(m.userId, ws);
                        return (
                          <div key={ws}>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Week of {fmtDay(ws)}</span>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">Same all week:</span>
                                <div className="w-36"><SelectSearch value={weekPreset[key] ?? null} onChange={(v) => setWeekPreset((p) => ({ ...p, [key]: v ?? "" }))} options={presets.map((p) => ({ id: p.id, label: p.name }))} placeholder="Shift…" /></div>
                                <div className="w-40"><SelectSearch value={weekStore[key] ?? null} onChange={(v) => setWeekStore((p) => ({ ...p, [key]: v ?? "" }))} options={grid.stores} placeholder="Store…" /></div>
                                <Button size="md" variant="outline" onClick={() => applyWeekFor(m.userId, ws)} disabled={pending || !weekPreset[key] || !weekStore[key]}>Apply</Button>
                                <Button size="md" variant="ghost" onClick={() => copyToNextWeek(ws)} disabled={pending}>Copy to next week</Button>
                              </div>
                            </div>

                            <div className="grid grid-cols-7 gap-1.5">
                              {weekDates.map((d) => {
                                const shifts = grid.cells[m.userId]?.[d] ?? [];
                                return (
                                  <div key={d} className="min-h-[80px] rounded-lg border border-border bg-input p-1.5">
                                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{fmtDayShort(d)}</div>
                                    {shifts.map((s) => (
                                      <div key={s.assignmentId} className="mb-1 rounded bg-primary/10 p-1">
                                        <button type="button" onClick={() => editExistingShift(m.userId, d, s.presetId, s.storeId, s.mode, s.windows)} className="block w-full text-left">
                                          <div className="text-[10.5px] font-semibold text-foreground">{s.label}</div>
                                          <div className="text-[10px] text-muted-foreground">{s.storeName}</div>
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => openDayEditor(m.userId, d)}
                                      className="w-full rounded border border-dashed border-border py-0.5 text-xs leading-none text-muted-foreground hover:border-muted-foreground"
                                    >
                                      +
                                    </button>
                                  </div>
                                );
                              })}
                            </div>

                            {editingCell && editingCell.userId === m.userId && weekDates.includes(editingCell.date) && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 p-2.5">
                                <span className="text-xs font-medium text-foreground">{fmtDay(editingCell.date)}:</span>
                                <div className="flex-1 min-w-[160px]">
                                  <SelectSearch value={cePreset || null} onChange={(v) => setCePreset(v ?? "")} options={[...presets.map((p) => ({ id: p.id, label: `${p.name} (${p.mode})` })), { id: CUSTOM, label: "Custom time…" }]} placeholder="Pick a shift…" />
                                </div>
                                {cePreset === CUSTOM && (
                                  <>
                                    <Input type="time" value={ceStart} onChange={(e) => setCeStart(e.target.value)} style={{ width: 110 }} />
                                    <Input type="time" value={ceEnd} onChange={(e) => setCeEnd(e.target.value)} style={{ width: 110 }} />
                                  </>
                                )}
                                <div className="flex-1 min-w-[160px]">
                                  <SelectSearch value={ceStore || null} onChange={(v) => setCeStore(v ?? "")} options={grid.stores} placeholder="Pick a store…" />
                                </div>
                                {(() => {
                                  const existing = grid.cells[editingCell.userId]?.[editingCell.date] ?? [];
                                  const match = existing.find((s) => s.storeId === ceStore);
                                  return match ? (
                                    <Button size="md" variant="ghost" onClick={() => { removeShift(match.assignmentId); setEditingCell(null); }} disabled={pending}>Remove</Button>
                                  ) : null;
                                })()}
                                <Button size="md" variant="outline" onClick={() => setEditingCell(null)}>Cancel</Button>
                                <Button size="md" onClick={saveDayEditor} disabled={pending || !cePreset || !ceStore}>Save</Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!grid && !isNew && rosters.length > 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">Pick a roster above to view or edit it.</p>
      )}

      {/* Shift presets modal */}
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
