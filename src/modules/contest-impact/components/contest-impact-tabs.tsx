"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/core/lib/utils";

const TABS = [
  { href: "/contest-impact", label: "Report" },
  { href: "/contest-impact/import", label: "Import data" },
  { href: "/contest-impact/historical", label: "Historical backfill" },
];

export function ContestImpactTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex w-fit rounded-xl border border-border bg-input p-0.5">
      {TABS.map((t) => {
        const active = t.href === "/contest-impact" ? pathname === "/contest-impact" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
