import Link from "next/link";
import { cn } from "@/core/lib/utils";

export function SummaryTabs({ active }: { active: "campaigns" | "brand-visibility" }) {
  const tabs = [
    { id: "campaigns" as const, label: "Campaigns", href: "/summary" },
    { id: "brand-visibility" as const, label: "Brand visibility", href: "/summary?tab=brand-visibility" },
  ];
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            active === t.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
