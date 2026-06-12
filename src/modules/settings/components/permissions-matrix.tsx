"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/core/lib/utils";
import { setRolePermission, setRoleLanding } from "../actions";

type Role = { id: string; slug: string; name: string; landing_page: string | null };
type Perm = { key: string; label: string };

export function PermissionsMatrix({
  roles,
  permissions,
  granted,
}: {
  roles: Role[];
  permissions: Perm[];
  granted: Record<string, string[]>; // roleId -> permission keys
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // local optimistic state
  const [state, setState] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {};
    for (const r of roles) m[r.id] = new Set(granted[r.id] ?? []);
    return m;
  });

  function toggle(role: Role, perm: string) {
    if (role.slug === "admin") return; // admin always has everything
    const has = state[role.id]?.has(perm) ?? false;
    setState((prev) => {
      const next = { ...prev, [role.id]: new Set(prev[role.id]) };
      if (has) next[role.id].delete(perm);
      else next[role.id].add(perm);
      return next;
    });
    start(async () => {
      const res = await setRolePermission(role.id, perm, !has);
      if (res?.error) {
        window.alert(res.error);
        router.refresh();
      }
    });
  }

  function changeLanding(role: Role, landing: string) {
    start(async () => {
      const res = await setRoleLanding(role.id, landing);
      if (res?.error) window.alert(res.error);
      router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-semibold">Module</th>
            {roles.map((r) => (
              <th key={r.id} className="px-4 py-3 text-center font-semibold">
                {r.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {permissions.map((p) => (
            <tr key={p.key} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5 font-medium text-foreground">{p.label}</td>
              {roles.map((r) => {
                const isAdmin = r.slug === "admin";
                const on = isAdmin || (state[r.id]?.has(p.key) ?? false);
                return (
                  <td key={r.id} className="px-4 py-2.5 text-center">
                    <button
                      type="button"
                      disabled={isAdmin || pending}
                      onClick={() => toggle(r, p.key)}
                      aria-label={`${r.name} — ${p.label}`}
                      className={cn(
                        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                        on ? "bg-primary" : "bg-border",
                        isAdmin && "opacity-50",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                          on ? "translate-x-4.5" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="bg-muted/30">
            <td className="px-4 py-2.5 font-medium text-foreground">Landing page after login</td>
            {roles.map((r) => (
              <td key={r.id} className="px-3 py-2.5 text-center">
                <select
                  value={r.landing_page ?? ""}
                  onChange={(e) => changeLanding(r, e.target.value)}
                  className="rounded-lg border border-transparent bg-input px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="">Default</option>
                  {permissions.map((p) => (
                    <option key={p.key} value={`/${p.key}`}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-muted-foreground">
        Admin always has full access. Dashboard is reachable for everyone. New roles appear here automatically.
      </p>
    </div>
  );
}
