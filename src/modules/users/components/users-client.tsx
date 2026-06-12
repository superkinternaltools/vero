"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/core/ui/button";
import { Input } from "@/core/ui/input";
import { Modal } from "@/core/ui/modal";
import { MultiSelect } from "@/core/ui/multi-select";
import { cn } from "@/core/lib/utils";
import type { UserRow, UserStatus } from "../types";
import { approveUser, updateUser, inviteUser } from "../actions";

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

export function UsersClient({
  users,
  roles,
  departments,
  jobTitles,
  stores,
}: {
  users: UserRow[];
  roles: RoleOpt[];
  departments: Opt[];
  jobTitles: Opt[];
  stores: StoreOpt[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // edit dialog
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<UserStatus>("active");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [jobTitleId, setJobTitleId] = useState("");
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState(false);

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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {users.length} user{users.length === 1 ? "" : "s"}. Approve sign-ups and assign access.
          </p>
        </div>
        <Button size="md" onClick={openInvite}>
          <UserPlus className="h-4 w-4" />
          Invite user
        </Button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Roles</th>
              <th className="px-4 py-3 font-semibold">Departments</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border align-top last:border-0">
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
                    {u.status === "pending" && (
                      <Button size="md" onClick={() => approve(u)} disabled={pending}>
                        Approve
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      aria-label="Edit"
                      className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit dialog */}
      <Modal open={open} onClose={() => setOpen(false)} title={`Edit ${editing?.email ?? "user"}`}>
        <div className="space-y-4">
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

      {/* Invite dialog */}
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
            <p className="text-sm font-medium text-success">Invite sent! They&apos;ll appear here once they join.</p>
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
    </div>
  );
}
