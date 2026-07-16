"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  ListChecks,
  Table2,
  BarChart3,
  Trophy,
  Megaphone,
  Store,
  Users,
  Building2,
  Settings,
  CalendarClock,
  Camera,
  LogOut,
} from "lucide-react";
import { signOutAction } from "@/modules/auth/actions";
import { cn } from "@/core/lib/utils";

type Item = { key: string; name: string; href: string; icon: typeof LayoutDashboard };
type Group = { label: string; items: Item[] };

const groups: Group[] = [
  {
    label: "Overview",
    items: [
      { key: "dashboard", name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { key: "tasks", name: "Tasks", href: "/tasks", icon: ClipboardList },
      { key: "review", name: "Review", href: "/review", icon: ListChecks },
      { key: "attendance_punch", name: "My attendance", href: "/attendance/punch", icon: Camera },
    ],
  },
  {
    label: "Insights",
    items: [
      { key: "summary", name: "Summary", href: "/summary", icon: Table2 },
      { key: "analysis", name: "Analysis", href: "/analysis", icon: BarChart3 },
      { key: "leaderboard", name: "Leaderboard", href: "/leaderboard", icon: Trophy },
    ],
  },
  {
    label: "Manage",
    items: [
      { key: "campaigns", name: "Campaigns", href: "/campaigns", icon: Megaphone },
      { key: "attendance", name: "Attendance", href: "/attendance", icon: CalendarClock },
      { key: "stores", name: "Stores", href: "/stores", icon: Store },
      { key: "users", name: "Users", href: "/users", icon: Users },
      { key: "org", name: "Roles & Departments", href: "/org", icon: Building2 },
      { key: "settings", name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar({
  displayName,
  email,
  allowed,
}: {
  displayName: string;
  email: string;
  allowed: string[];
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-16 items-center px-6 text-xl font-bold tracking-tight text-foreground">
        Vero<span className="text-primary">.</span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {groups.map((group) => {
          const items = group.items.filter((i) => allowed.includes(i.key));
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <ul className="space-y-1">
                {items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-muted",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
