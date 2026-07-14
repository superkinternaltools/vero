"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserPlus, Plus, Upload, Trash2, Link2, X } from "lucide-react";
import { Button } from "@/core/ui/button";
import { Input } from "@/core/ui/input";
import { Modal } from "@/core/ui/modal";
import { MultiSelect } from "@/core/ui/multi-select";
import { cn } from "@/core/lib/utils";
import type { UserRow, UserStatus, ShellUser } from "../types";
import {
  approveUser,
  updateUser,
  deleteUser,
  rejectPendingUser,
  inviteUser,
  createShellUser,
  updateShellUser,
  deleteShellUser,
  mapUserToShell,
  bulkApproveUsers,
  bulkSetRole,
  bulkSetDepartment,
} from "../actions";
import { BulkUploadModal } from "./bulk-upload-modal";

type RoleOpt = { id: string; slug: string; name: string };
type Opt = { id: string; name: string };
type StoreOpt = { id: string; label: string };

const STATUS_STYLES: Record<UserStatus, string> = {
  active: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  inactive: "bg-muted text-muted-foreground",
};

const selectClass =
  "w-full rounded-xl border border-transparent bg-input px-4 py-3 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30";

function fuzzyScore(a: string, b: string): number {
  const an = a.toLowerCase().trim();
  const bn = b.toLowerCase().trim();
  if (an === bn) return 100;
  const at = an.split(/[\s.]+/).filter(Boolean);
  const bt = bn.split(/[\s.]+/).filter(Boolean);
  let score = 0;
  for (const x of at) {
    for (const y of bt) {
      if (x === y) score += 25;
      else if (x.length === 1 && y.startsWith(x)) score += 12;
      else if (y.length === 1 && x.startsWith(y)) score += 12;
      else if (x.includes(y) || y.includes(x)) score += 8;
    }
  }
  return Math.min(score, 95);
}

export function UsersClient({
  users,
  shellUsers,
  roles,
  departments,
  jobTitles,
  stores,
}: {
  users: UserRow[];
  shellUsers: ShellUser[];
  roles: RoleOpt[];
  departments: Opt[];
  jobTitles: Opt[];
  stores: StoreOpt[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ── Edit real user modal ────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<UserStatus>("active");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [jobTitleId, setJobTitleId] = useState("");
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ── Invite modal ────────────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState(false);

  // ── Shell user add/edit modal ───────────────────────────────────────────
  const [shellOpen, setShellOpen] = useState(false);
  const [editingShell, setEditingShell] = useState<ShellUser | null>(null);
  const [shellName, setShellName] = useState("");
  const [shellJobTitleId, setShellJobTitleId] = useState("");
  const [shellRoleId, setShellRoleId] = useState("");
  const [shellStoreIds, setShellStoreIds] = useState<string[]>([]);
  const [shellError, setShellError] = useState<string | null>(null);

  // ── Map-to-shell modal ─────────────────────────────────────────────────
  const [mapOpen, setMapOpen] = useState(false);
  const [mappingUser, setMappingUser] = useState<UserRow | null>(null);
  const [selectedShellId, setSelectedShellId] = useState<string | null>(null);
  const [shellSearch, setShellSearch] = useState("");
  const [mapError, setMapError] = useState<string | null>(null);

  // ── Bulk upload modal ──────────────────────────────────────────────────
  const [bulkOpen, setBulkOpen] = useState(false);

  // ── Bulk selection ─────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRoleIds, setBulkRoleIds] = useState<string[]>([]);
  const [bulkDeptIds, setBulkDeptIds] = useState<string[]>([]);

  // ── Bulk map-to-shell modal ────────────────────────────────────────────────
  const [bulkMapOpen, setBulkMapOpen] = useState(false);
  const [bulkMappings, setBulkMappings] = useState<Record<string, string>>({}); // userId → shellId

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAllIn(list: UserRow[]) {
    const allSelected = list.length > 0 && list.every((u) => selectedIds.has(u.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      list.forEach((u) => (allSelected ? next.delete(u.id) : next.add(u.id)));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkRoleIds([]);
    setBulkDeptIds([]);
    setBulkMappings({});
  }

  function bulkApprove() {
    const pendingIds = users
      .filter((u) => selectedIds.has(u.id) && u.status === "pending")
      .map((u) => u.id);
    if (!pendingIds.length) return;
    startTransition(async () => {
      await bulkApproveUsers(pendingIds);
      clearSelection();
      router.refresh();
    });
  }

  function applyBulkRole() {
    if (!bulkRoleIds.length) return;
    startTransition(async () => {
      await bulkSetRole(Array.from(selectedIds), bulkRoleIds);
      clearSelection();
      router.refresh();
    });
  }

  function applyBulkDept() {
    if (!bulkDeptIds.length) return;
    startTransition(async () => {
      await bulkSetDepartment(Array.from(selectedIds), bulkDeptIds);
      clearSelection();
      router.refresh();
    });
  }

  function openBulkMap() {
    setBulkMappings({});
    setBulkMapOpen(true);
  }

  function confirmBulkMap() {
    const pairs = Object.entries(bulkMappings).filter(([, shellId]) => shellId);
    if (!pairs.length) return;
    startTransition(async () => {
      for (const [userId, shellId] of pairs) {
        await mapUserToShell(userId, shellId);
      }
      setBulkMapOpen(false);
      clearSelection();
      router.refresh();
    });
  }

  const selectedPendingUsers = users.filter(
    (u) => selectedIds.has(u.id) && u.status === "pending",
  );

  const bulkMappingCount = Object.values(bulkMappings).filter(Boolean).length;

  const selectedPendingCount = users.filter(
    (u) => selectedIds.has(u.id) && u.status === "pending",
  ).length;

  // ── Handlers: real users ───────────────────────────────────────────────
  function openEdit(u: UserRow) {
    setEditing(u);
    setDisplayName(u.display_name ?? "");
    setStatus(u.status);
    setRoleIds(u.roleIds);
    setDeptIds(u.departmentIds);
    setJobTitleId(u.job_title_id ?? "");
    setStoreIds(u.storeIds);
    setError(null);
    setOpen(true);
  }

  function save() {
    if (!editing) return;
    const adminRole = roles.find((r) => r.slug === "admin");
    const is_admin = adminRole ? roleIds.includes(adminRole.id) : false;
    startTransition(async () => {
      const res = await updateUser(editing.id, {
        display_name: displayName.trim(),
        status,
        is_admin,
        job_title_id: jobTitleId || null,
        roleIds,
        departmentIds: deptIds,
        storeIds,
      });
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  function approve(u: UserRow) {
    startTransition(async () => {
      const res = await approveUser(u.id);
      if (!res?.error) router.refresh();
    });
  }

  function removeUser(u: UserRow) {
    if (!window.confirm(`Remove ${u.display_name || u.email}? They'll lose access immediately.`))
      return;
    startTransition(async () => {
      const res = await deleteUser(u.id);
      if (res?.error) {
        alert(res.error);
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(u.id);
        return next;
      });
      router.refresh();
    });
  }

  function reject(u: UserRow) {
    if (
      !window.confirm(
        `Reject the signup for ${u.email}? This permanently deletes their account and can't be undone.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await rejectPendingUser(u.id);
      if (res?.error) {
        alert(res.error);
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(u.id);
        return next;
      });
      router.refresh();
    });
  }

  // ── Handlers: invite ──────────────────────────────────────────────────
  function openInvite() {
    setInviteEmail("");
    setInviteName("");
    setInviteError(null);
    setInviteOk(false);
    setInviteOpen(true);
  }

  function sendInvite() {
    startTransition(async () => {
      const res = await inviteUser(inviteEmail, inviteName);
      if (res?.error) {
        setInviteError(res.error);
        setInviteOk(false);
      } else {
        setInviteError(null);
        setInviteOk(true);
        router.refresh();
      }
    });
  }

  // ── Handlers: shell users ─────────────────────────────────────────────
  function openAddShell() {
    setEditingShell(null);
    setShellName("");
    setShellJobTitleId("");
    setShellRoleId("");
    setShellStoreIds([]);
    setShellError(null);
    setShellOpen(true);
  }

  function openEditShell(s: ShellUser) {
    setEditingShell(s);
    setShellName(s.display_name);
    setShellJobTitleId(s.job_title_id ?? "");
    setShellRoleId(s.role_id ?? "");
    setShellStoreIds(s.storeIds);
    setShellError(null);
    setShellOpen(true);
  }

  function saveShell() {
    startTransition(async () => {
      const values = {
        display_name: shellName.trim(),
        job_title_id: shellJobTitleId || null,
        role_id: shellRoleId || null,
        storeIds: shellStoreIds,
      };
      if (!values.display_name) {
        setShellError("Name is required.");
        return;
      }
      const res = editingShell
        ? await updateShellUser(editingShell.id, values)
        : await createShellUser(values);
      if (res?.error) setShellError(res.error);
      else {
        setShellOpen(false);
        router.refresh();
      }
    });
  }

  function removeShell(s: ShellUser) {
    if (!window.confirm(`Delete shell user "${s.display_name}"? This can't be undone.`)) return;
    startTransition(async () => {
      await deleteShellUser(s.id);
      router.refresh();
    });
  }

  // ── Handlers: map to shell ─────────────────────────────────────────────
  function openMap(u: UserRow) {
    setMappingUser(u);
    setSelectedShellId(null);
    setShellSearch("");
    setMapError(null);
    setMapOpen(true);
  }

  function confirmMap() {
    if (!mappingUser || !selectedShellId) return;
    startTransition(async () => {
      const res = await mapUserToShell(mappingUser.id, selectedShellId);
      if (res?.error) setMapError(res.error);
      else {
        setMapOpen(false);
        router.refresh();
      }
    });
  }

  // Sorted shell users by fuzzy match against pending user name
  const sortedShells = mappingUser
    ? [...shellUsers]
        .map((s) => ({
          ...s,
          score: fuzzyScore(mappingUser.display_name ?? mappingUser.email, s.display_name),
        }))
        .filter(
          (s) =>
            !shellSearch ||
            s.display_name.toLowerCase().includes(shellSearch.toLowerCase()) ||
            s.id.toLowerCase().includes(shellSearch.toLowerCase()),
        )
        .sort((a, b) => b.score - a.score)
    : [];

  const signupStoreLabels = (user: UserRow) =>
    user.signupStoreIds
      .map((sid) => stores.find((s) => s.id === sid)?.label ?? sid)
      .filter(Boolean);

  const pendingUsers = users.filter((u) => u.status === "pending");
  const otherUsers = users.filter((u) => u.status !== "pending");

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {otherUsers.length} user{otherUsers.length === 1 ? "" : "s"} ·{" "}
            {pendingUsers.length} pending · {shellUsers.length} shell user
            {shellUsers.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="md" onClick={() => setBulkOpen(true)}>
            <Upload className="h-4 w-4" />
            Bulk upload
          </Button>
          <Button variant="outline" size="md" onClick={openAddShell}>
            <Plus className="h-4 w-4" />
            Add shell user
          </Button>
          <Button size="md" onClick={openInvite}>
            <UserPlus className="h-4 w-4" />
            Invite user
          </Button>
        </div>
      </div>

      {/* ── Shell users table ── */}
      {shellUsers.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Shell users — not yet joined ({shellUsers.length})
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Job Title</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Stores</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shellUsers.map((s) => (
                  <tr key={s.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                        {s.id}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{s.display_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.jobTitleName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.roleName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.storeLabels.length > 0 ? (
                        <span title={s.storeLabels.join(", ")}>
                          {s.storeLabels.length} store{s.storeLabels.length !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditShell(s)}
                          aria-label="Edit"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeShell(s)}
                          disabled={pending}
                          aria-label="Delete"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {shellUsers.length === 0 && (
        <button
          type="button"
          onClick={openAddShell}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card py-8 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add your first shell user
        </button>
      )}

      {/* ── Pending approvals table ── */}
      {pendingUsers.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pending approvals ({pendingUsers.length})
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={pendingUsers.length > 0 && pendingUsers.every((u) => selectedIds.has(u.id))}
                      onChange={() => toggleSelectAllIn(pendingUsers)}
                      className="h-4 w-4 cursor-pointer rounded accent-primary"
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Roles</th>
                  <th className="px-4 py-3 font-semibold">Departments</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map((u) => (
                  <tr key={u.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(u.id)}
                        onChange={() => toggleSelect(u.id)}
                        className="h-4 w-4 cursor-pointer rounded accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {u.display_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.roleNames.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.departmentNames.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {shellUsers.length > 0 && (
                          <Button
                            variant="outline"
                            size="md"
                            onClick={() => openMap(u)}
                            disabled={pending}
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            Map
                          </Button>
                        )}
                        <Button size="md" onClick={() => approve(u)} disabled={pending}>
                          Approve
                        </Button>
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          aria-label="Edit"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => reject(u)}
                          disabled={pending}
                          aria-label="Reject"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Real users table ── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Users ({otherUsers.length})
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={otherUsers.length > 0 && otherUsers.every((u) => selectedIds.has(u.id))}
                    onChange={() => toggleSelectAllIn(otherUsers)}
                    className="h-4 w-4 cursor-pointer rounded accent-primary"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Roles</th>
                <th className="px-4 py-3 font-semibold">Departments</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {otherUsers.map((u) => (
                <tr key={u.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      onChange={() => toggleSelect(u.id)}
                      className="h-4 w-4 cursor-pointer rounded accent-primary"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {u.display_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                        STATUS_STYLES[u.status],
                      )}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.roleNames.join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.departmentNames.join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        aria-label="Edit"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeUser(u)}
                        disabled={pending}
                        aria-label="Delete"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {otherUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Edit real user modal ── */}
      <Modal open={open} onClose={() => setOpen(false)} title={`Edit ${editing?.email ?? "user"}`}>
        <div className="space-y-4">
          {editing?.status === "pending" && editing.signupStoreIds.length > 0 && (
            <div className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
              <p className="font-medium text-foreground mb-1">Declared stores on signup</p>
              <p className="text-muted-foreground">{signupStoreLabels(editing).join(", ")}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Display name</label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as UserStatus)}
                className={selectClass}
              >
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Job title</label>
              <select
                value={jobTitleId}
                onChange={(e) => setJobTitleId(e.target.value)}
                className={selectClass}
              >
                <option value="">—</option>
                {jobTitles.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Roles</label>
            <MultiSelect
              options={roles.map((r) => ({ id: r.id, label: r.name }))}
              selected={roleIds}
              onChange={setRoleIds}
              placeholder="Select roles…"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Departments</label>
            <MultiSelect
              options={departments.map((d) => ({ id: d.id, label: d.name }))}
              selected={deptIds}
              onChange={setDeptIds}
              placeholder="Select departments…"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Mapped stores</label>
            <MultiSelect
              options={stores.map((s) => ({ id: s.id, label: s.label }))}
              selected={storeIds}
              onChange={setStoreIds}
              placeholder="Select stores…"
              emptyText="No stores yet — add some in Stores."
            />
          </div>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="md" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="md" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Shell user add/edit modal ── */}
      <Modal
        open={shellOpen}
        onClose={() => setShellOpen(false)}
        title={editingShell ? `Edit ${editingShell.display_name}` : "Add shell user"}
      >
        <div className="space-y-4">
          {!editingShell && (
            <p className="text-sm text-muted-foreground">
              An ID will be auto-generated. Share it with the person when you onboard them — they
              declare their stores on signup so you can find them easily here.
            </p>
          )}
          {editingShell && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">ID:</span>
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                {editingShell.id}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Full name *</label>
            <Input
              value={shellName}
              onChange={(e) => setShellName(e.target.value)}
              placeholder="e.g. Ravi Kumar"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Job title</label>
              <select
                value={shellJobTitleId}
                onChange={(e) => setShellJobTitleId(e.target.value)}
                className={selectClass}
              >
                <option value="">—</option>
                {jobTitles.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Role</label>
              <select
                value={shellRoleId}
                onChange={(e) => setShellRoleId(e.target.value)}
                className={selectClass}
              >
                <option value="">—</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Stores</label>
            <MultiSelect
              options={stores}
              selected={shellStoreIds}
              onChange={setShellStoreIds}
              placeholder="Select stores…"
              emptyText="No stores yet."
            />
          </div>

          {shellError && <p className="text-sm font-medium text-danger">{shellError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="md" onClick={() => setShellOpen(false)}>
              Cancel
            </Button>
            <Button size="md" onClick={saveShell} disabled={pending}>
              {pending ? "Saving…" : editingShell ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Map to shell modal ── */}
      <Modal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        title={`Map ${mappingUser?.display_name ?? mappingUser?.email ?? "user"} to a shell`}
      >
        <div className="space-y-4">
          {mappingUser && (
            <div className="rounded-xl bg-muted/60 px-4 py-3 text-sm space-y-1">
              <p className="font-medium text-foreground">{mappingUser.display_name ?? "—"}</p>
              <p className="text-muted-foreground">{mappingUser.email}</p>
              {signupStoreLabels(mappingUser).length > 0 && (
                <p className="text-muted-foreground">
                  Declared stores: {signupStoreLabels(mappingUser).join(", ")}
                </p>
              )}
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Select the matching shell user. Their job title, role, and stores will be copied across
            and the shell will be removed.
          </p>

          <Input
            placeholder="Search by name or ID…"
            value={shellSearch}
            onChange={(e) => setShellSearch(e.target.value)}
          />

          <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
            {sortedShells.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No shell users match your search.
              </p>
            )}
            {sortedShells.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedShellId(s.id === selectedShellId ? null : s.id)}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                  selectedShellId === s.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{s.display_name}</span>
                      {s.score >= 40 && (
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                          Possible match
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {s.jobTitleName && <span>{s.jobTitleName}</span>}
                      {s.roleName && <span>{s.roleName}</span>}
                      {s.storeLabels.length > 0 && (
                        <span>
                          {s.storeLabels.length} store{s.storeLabels.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {s.id}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {mapError && <p className="text-sm font-medium text-danger">{mapError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="md" onClick={() => setMapOpen(false)}>
              Cancel
            </Button>
            <Button size="md" onClick={confirmMap} disabled={!selectedShellId || pending}>
              {pending ? "Mapping…" : "Confirm mapping"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Invite modal ── */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite user">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            They&apos;ll get an email invite to join. Once they accept, approve and assign their
            access here.
          </p>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Email address</label>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@superk.in"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              Display name (optional)
            </label>
            <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
          </div>

          {inviteError && <p className="text-sm font-medium text-danger">{inviteError}</p>}
          {inviteOk && (
            <p className="text-sm font-medium text-success">
              Invite sent! They&apos;ll appear here once they join.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="md" onClick={() => setInviteOpen(false)}>
              Close
            </Button>
            <Button size="md" onClick={sendInvite} disabled={pending}>
              {pending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Floating bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-lg md:left-64">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} selected
            </span>

            {selectedPendingCount > 0 && (
              <Button size="md" onClick={bulkApprove} disabled={pending}>
                Approve {selectedPendingCount} pending
              </Button>
            )}

            <div className="flex items-center gap-1.5">
              <div className="w-48">
                <MultiSelect
                  options={roles.map((r) => ({ id: r.id, label: r.name }))}
                  selected={bulkRoleIds}
                  onChange={setBulkRoleIds}
                  placeholder="Set roles…"
                  dropUp
                />
              </div>
              {bulkRoleIds.length > 0 && (
                <Button size="md" onClick={applyBulkRole} disabled={pending}>
                  Apply
                </Button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <div className="w-48">
                <MultiSelect
                  options={departments.map((d) => ({ id: d.id, label: d.name }))}
                  selected={bulkDeptIds}
                  onChange={setBulkDeptIds}
                  placeholder="Set departments…"
                  dropUp
                />
              </div>
              {bulkDeptIds.length > 0 && (
                <Button size="md" onClick={applyBulkDept} disabled={pending}>
                  Apply
                </Button>
              )}
            </div>

            {selectedPendingCount > 0 && shellUsers.length > 0 && (
              <Button variant="outline" size="md" onClick={openBulkMap} disabled={pending}>
                <Link2 className="h-4 w-4" />
                Map to shell ({selectedPendingCount})
              </Button>
            )}

            <button
              onClick={clearSelection}
              aria-label="Clear selection"
              className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Bulk map-to-shell modal ── */}
      <Modal
        open={bulkMapOpen}
        onClose={() => setBulkMapOpen(false)}
        title="Map users to shell profiles"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pick a matching shell profile for each user. Users left on &ldquo;Skip&rdquo; won&apos;t
            be changed.
          </p>

          <div className="max-h-96 overflow-y-auto space-y-3 pr-0.5">
            {selectedPendingUsers.map((u) => {
              const sortedShellOpts = [...shellUsers]
                .map((s) => ({
                  ...s,
                  score: fuzzyScore(u.display_name ?? u.email, s.display_name),
                }))
                .sort((a, b) => b.score - a.score);

              return (
                <div
                  key={u.id}
                  className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/40 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {u.display_name ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    {bulkMappings[u.id] && (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                        Will map
                      </span>
                    )}
                  </div>
                  <select
                    value={bulkMappings[u.id] ?? ""}
                    onChange={(e) =>
                      setBulkMappings((prev) => ({ ...prev, [u.id]: e.target.value }))
                    }
                    className={selectClass}
                  >
                    <option value="">Skip this user</option>
                    {sortedShellOpts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.display_name}
                        {s.score >= 40 ? " ✓" : ""}
                        {s.roleName ? ` · ${s.roleName}` : ""}
                        {s.storeLabels.length > 0 ? ` · ${s.storeLabels.length} stores` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-sm text-muted-foreground">
              {bulkMappingCount} of {selectedPendingUsers.length} users will be mapped
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="md" onClick={() => setBulkMapOpen(false)}>
                Cancel
              </Button>
              <Button size="md" onClick={confirmBulkMap} disabled={!bulkMappingCount || pending}>
                {pending ? "Mapping…" : `Map ${bulkMappingCount} user${bulkMappingCount !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Bulk upload modal ── */}
      <BulkUploadModal
        open={bulkOpen}
        onClose={() => {
          setBulkOpen(false);
          router.refresh();
        }}
        roles={roles}
        jobTitles={jobTitles}
        stores={stores}
      />
    </div>
  );
}
