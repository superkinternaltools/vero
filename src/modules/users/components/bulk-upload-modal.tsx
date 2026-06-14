"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FileText, AlertTriangle, CheckCircle, Download } from "lucide-react";
import { Button } from "@/core/ui/button";
import { Modal } from "@/core/ui/modal";
import { cn } from "@/core/lib/utils";
import { bulkCreateShellUsers } from "../actions";
import type { BulkShellRow } from "../actions";

type RoleOpt = { id: string; slug: string; name: string };
type Opt = { id: string; name: string };
type StoreOpt = { id: string; label: string };

interface ParseIssue {
  field: string;
  message: string;
  level: "error" | "warning";
}

interface ReviewRow {
  id: string;
  display_name: string;
  jobTitleRaw: string;
  jobTitleId: string | null;
  roleRaw: string;
  roleId: string | null;
  storeNamesRaw: string[];
  storeIds: string[];
  issues: ParseIssue[];
}

function parseDelimited(text: string): string[][] {
  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  if (!lines.length) return [];
  const hasTabs = lines[0].includes("\t");
  const sep = hasTabs ? "\t" : ",";
  return lines.map((line) =>
    line.split(sep).map((cell) => cell.trim().replace(/^"|"$/g, "").trim()),
  );
}

function downloadTemplate(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkUploadModal({
  open,
  onClose,
  roles,
  jobTitles,
  stores,
}: {
  open: boolean;
  onClose: () => void;
  roles: RoleOpt[];
  jobTitles: Opt[];
  stores: StoreOpt[];
}) {
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");

  // File 1
  const [f1Mode, setF1Mode] = useState<"paste" | "file">("paste");
  const [f1Text, setF1Text] = useState("");
  const f1Ref = useRef<HTMLInputElement>(null);

  // File 2
  const [f2Mode, setF2Mode] = useState<"paste" | "file">("paste");
  const [f2Text, setF2Text] = useState("");
  const f2Ref = useRef<HTMLInputElement>(null);

  const [parseError, setParseError] = useState<string | null>(null);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStep("upload");
    setF1Text("");
    setF2Text("");
    setParseError(null);
    setReviewRows([]);
    setSubmitError(null);
    setCreatedCount(0);
    if (f1Ref.current) f1Ref.current.value = "";
    if (f2Ref.current) f2Ref.current.value = "";
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(String(e.target?.result ?? ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  async function parseAndReview() {
    setParseError(null);

    let text1 = f1Text;
    let text2 = f2Text;

    if (f1Mode === "file" && f1Ref.current?.files?.[0]) {
      text1 = await readFile(f1Ref.current.files[0]);
    }
    if (f2Mode === "file" && f2Ref.current?.files?.[0]) {
      text2 = await readFile(f2Ref.current.files[0]);
    }

    if (!text1.trim()) {
      setParseError("File 1 (People master) is empty.");
      return;
    }
    if (!text2.trim()) {
      setParseError("File 2 (Store mapping) is empty.");
      return;
    }

    const rows1 = parseDelimited(text1);
    const rows2 = parseDelimited(text2);

    if (rows1.length < 2) {
      setParseError("File 1 needs at least a header row and one data row.");
      return;
    }
    if (rows2.length < 2) {
      setParseError("File 2 needs at least a header row and one data row.");
      return;
    }

    // Parse File 1 header: ID, Name, Job Title, Role
    const h1 = rows1[0].map((c) => c.toLowerCase());
    const idCol = h1.findIndex((c) => c === "id");
    const nameCol = h1.findIndex((c) => c.includes("name"));
    const jtCol = h1.findIndex((c) => c.includes("job") || c.includes("title"));
    const roleCol = h1.findIndex((c) => c.includes("role"));

    if (idCol < 0 || nameCol < 0) {
      setParseError("File 1 must have 'ID' and 'Name' columns.");
      return;
    }

    // Build person map from File 1
    type PersonEntry = { name: string; jobTitleRaw: string; roleRaw: string };
    const personMap = new Map<string, PersonEntry>();
    for (const row of rows1.slice(1)) {
      const id = row[idCol]?.trim();
      if (!id) continue;
      personMap.set(id, {
        name: row[nameCol]?.trim() ?? "",
        jobTitleRaw: jtCol >= 0 ? (row[jtCol]?.trim() ?? "") : "",
        roleRaw: roleCol >= 0 ? (row[roleCol]?.trim() ?? "") : "",
      });
    }

    if (!personMap.size) {
      setParseError("No valid rows found in File 1.");
      return;
    }

    // Parse File 2: first col = Store, remaining cols = job title names, cells = person IDs
    const h2 = rows2[0];
    const storeCol2 = 0;
    const jobTitleCols = h2.slice(1); // column names are job title names

    // Build ID → storeIds map
    const idToStoreIds = new Map<string, string[]>();

    for (const row of rows2.slice(1)) {
      const storeName = row[storeCol2]?.trim() ?? "";
      if (!storeName) continue;

      // Find matching store (case-insensitive)
      const matchedStore = stores.find(
        (s) =>
          s.label.toLowerCase().includes(storeName.toLowerCase()) ||
          storeName.toLowerCase().includes(s.label.split("—")[1]?.trim().toLowerCase() ?? ""),
      );
      const storeId = matchedStore?.id ?? null;

      for (let ci = 1; ci < row.length; ci++) {
        const cell = row[ci]?.trim() ?? "";
        if (!cell) continue;
        // A cell can hold multiple IDs separated by ; or /
        const ids = cell.split(/[;/]/).map((x) => x.trim()).filter(Boolean);
        for (const pid of ids) {
          if (!personMap.has(pid)) continue;
          if (storeId) {
            const existing = idToStoreIds.get(pid) ?? [];
            if (!existing.includes(storeId)) existing.push(storeId);
            idToStoreIds.set(pid, existing);
          }
        }
      }
    }

    // Normalise lookups
    function matchJobTitle(raw: string): string | null {
      if (!raw) return null;
      return (
        jobTitles.find((j) => j.name.toLowerCase() === raw.toLowerCase())?.id ?? null
      );
    }
    function matchRole(raw: string): string | null {
      if (!raw) return null;
      return (
        roles.find((r) => r.name.toLowerCase() === raw.toLowerCase())?.id ?? null
      );
    }

    const seenIds = new Set<string>();
    const rows: ReviewRow[] = [];

    for (const [id, person] of personMap) {
      const issues: ParseIssue[] = [];

      if (seenIds.has(id)) {
        issues.push({ field: "ID", message: `Duplicate ID: ${id}`, level: "error" });
      }
      seenIds.add(id);

      const jobTitleId = matchJobTitle(person.jobTitleRaw);
      if (person.jobTitleRaw && !jobTitleId) {
        issues.push({
          field: "Job Title",
          message: `"${person.jobTitleRaw}" not found in Vero — will be left blank`,
          level: "warning",
        });
      }

      const roleId = matchRole(person.roleRaw);
      if (person.roleRaw && !roleId) {
        issues.push({
          field: "Role",
          message: `"${person.roleRaw}" not found in Vero — will be left blank`,
          level: "warning",
        });
      }

      const resolvedStoreIds = idToStoreIds.get(id) ?? [];

      rows.push({
        id,
        display_name: person.name,
        jobTitleRaw: person.jobTitleRaw,
        jobTitleId,
        roleRaw: person.roleRaw,
        roleId,
        storeNamesRaw: [],
        storeIds: resolvedStoreIds,
        issues,
      });
    }

    setReviewRows(rows);
    setStep("review");
  }

  function confirm() {
    const payload: BulkShellRow[] = reviewRows
      .filter((r) => !r.issues.some((i) => i.level === "error"))
      .map((r) => ({
        id: r.id,
        display_name: r.display_name,
        job_title_id: r.jobTitleId,
        role_id: r.roleId,
        storeIds: r.storeIds,
      }));

    startTransition(async () => {
      const res = await bulkCreateShellUsers(payload);
      if (res.error) {
        setSubmitError(res.error);
      } else {
        setCreatedCount(res.created ?? 0);
        setStep("done");
      }
    });
  }

  const errorCount = reviewRows.filter((r) => r.issues.some((i) => i.level === "error")).length;
  const warnCount = reviewRows.filter(
    (r) => r.issues.some((i) => i.level === "warning") && !r.issues.some((i) => i.level === "error"),
  ).length;
  const okCount = reviewRows.length - errorCount - warnCount;

  return (
    <Modal open={open} onClose={handleClose} title="Bulk upload shell users">
      {step === "upload" && (
        <div className="space-y-6">
          {/* Format guide */}
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm space-y-3">
            <p className="font-semibold text-foreground">Required format — two files</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  File 1 — People master
                </p>
                <pre className="rounded-lg bg-card border border-border p-2 text-xs text-foreground leading-relaxed overflow-x-auto">
                  {`ID,Name,Job Title,Role\nSK-001,Ravi Kumar,SAE,Field User\nSK-002,Priya S,ASM,Field User`}
                </pre>
                <button
                  type="button"
                  onClick={() =>
                    downloadTemplate(
                      "vero-people-master.csv",
                      "ID,Name,Job Title,Role\nSK-001,Example Name,SAE,Field User\n",
                    )
                  }
                  className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Download className="h-3 w-3" /> Download template
                </button>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  File 2 — Store mapping
                </p>
                <pre className="rounded-lg bg-card border border-border p-2 text-xs text-foreground leading-relaxed overflow-x-auto">
                  {`Store,SAE,ASM\nKoramangala,SK-001,SK-002\nHSR Layout,SK-001,`}
                </pre>
                <button
                  type="button"
                  onClick={() =>
                    downloadTemplate(
                      "vero-store-mapping.csv",
                      `Store,${jobTitles.map((j) => j.name).join(",") || "SAE,ASM"}\nStore Name Here,SK-001,\n`,
                    )
                  }
                  className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Download className="h-3 w-3" /> Download template
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Columns in File 2 after <strong>Store</strong> should match your job title names
              exactly. A cell can have one ID; use <code>SK-001/SK-002</code> for multiple people in
              the same role at a store.
            </p>
          </div>

          {/* File 1 */}
          <FileSection
            label="File 1 — People master"
            hint="ID | Name | Job Title | Role"
            mode={f1Mode}
            onModeChange={setF1Mode}
            text={f1Text}
            onTextChange={setF1Text}
            inputRef={f1Ref}
          />

          {/* File 2 */}
          <FileSection
            label="File 2 — Store mapping"
            hint="Store | [Job title columns] — cells contain person IDs"
            mode={f2Mode}
            onModeChange={setF2Mode}
            text={f2Text}
            onTextChange={setF2Text}
            inputRef={f2Ref}
          />

          {parseError && (
            <p className="flex items-start gap-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {parseError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="md" onClick={handleClose}>
              Cancel
            </Button>
            <Button size="md" onClick={parseAndReview}>
              Parse &amp; preview
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex flex-wrap gap-3 text-sm">
            {okCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-success">
                <CheckCircle className="h-3.5 w-3.5" />
                {okCount} ready
              </span>
            )}
            {warnCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                {warnCount} with warnings
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1 text-danger">
                <AlertTriangle className="h-3.5 w-3.5" />
                {errorCount} with errors (will be skipped)
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">ID</th>
                  <th className="px-3 py-2 text-left font-semibold">Name</th>
                  <th className="px-3 py-2 text-left font-semibold">Job Title</th>
                  <th className="px-3 py-2 text-left font-semibold">Role</th>
                  <th className="px-3 py-2 text-left font-semibold">Stores</th>
                  <th className="px-3 py-2 text-left font-semibold">Issues</th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.map((row) => {
                  const hasError = row.issues.some((i) => i.level === "error");
                  const hasWarn = row.issues.some((i) => i.level === "warning");
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-border last:border-0",
                        hasError && "bg-danger/5",
                        !hasError && hasWarn && "bg-warning/5",
                      )}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {row.id}
                      </td>
                      <td className="px-3 py-2 font-medium">{row.display_name || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.jobTitleId ? (
                          row.jobTitleRaw
                        ) : row.jobTitleRaw ? (
                          <span className="text-warning">{row.jobTitleRaw} ⚠</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.roleId ? (
                          row.roleRaw
                        ) : row.roleRaw ? (
                          <span className="text-warning">{row.roleRaw} ⚠</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.storeIds.length > 0 ? (
                          <span>
                            {row.storeIds.length} store{row.storeIds.length !== 1 ? "s" : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row.issues.length === 0 ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : (
                          <div className="space-y-0.5">
                            {row.issues.map((iss, i) => (
                              <p
                                key={i}
                                className={cn(
                                  "text-xs",
                                  iss.level === "error" ? "text-danger" : "text-warning",
                                )}
                              >
                                {iss.message}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {submitError && <p className="text-sm font-medium text-danger">{submitError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="md" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button
              size="md"
              onClick={confirm}
              disabled={pending || reviewRows.length - errorCount === 0}
            >
              {pending
                ? "Creating…"
                : `Create ${reviewRows.length - errorCount} shell user${reviewRows.length - errorCount !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4 py-4 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-success" />
          <p className="text-lg font-semibold text-foreground">
            {createdCount} shell user{createdCount !== 1 ? "s" : ""} created
          </p>
          <p className="text-sm text-muted-foreground">
            They&apos;ll appear in the shell users list. Map them when the real person signs up.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button variant="outline" size="md" onClick={reset}>
              Upload another batch
            </Button>
            <Button size="md" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Shared file-section sub-component ────────────────────────────────────────

function FileSection({
  label,
  hint,
  mode,
  onModeChange,
  text,
  onTextChange,
  inputRef,
}: {
  label: string;
  hint: string;
  mode: "paste" | "file";
  onModeChange: (m: "paste" | "file") => void;
  text: string;
  onTextChange: (t: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <div className="flex rounded-lg border border-border bg-input text-xs overflow-hidden">
          {(["paste", "file"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={cn(
                "px-3 py-1.5 capitalize transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "file" ? "CSV file" : "Paste"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {mode === "paste" ? (
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={4}
          placeholder="Paste rows here (Tab or comma separated)…"
          className="w-full rounded-xl border border-transparent bg-input px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none font-mono"
        />
      ) : (
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-border bg-input px-4 py-4 transition-colors hover:border-primary/50">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-foreground">Click to upload CSV</p>
            <p className="text-xs text-muted-foreground">or drag and drop</p>
          </div>
          <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden" />
          {inputRef.current?.files?.[0] && (
            <span className="ml-auto flex items-center gap-1 text-xs text-success">
              <FileText className="h-3.5 w-3.5" />
              {inputRef.current.files[0].name}
            </span>
          )}
        </label>
      )}
    </div>
  );
}
