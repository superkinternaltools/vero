import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

export function AppShell({
  displayName,
  email,
  allowed,
  children,
}: {
  displayName: string;
  email: string;
  allowed: string[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar displayName={displayName} email={email} allowed={allowed} />

      <div className="flex flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
          <span className="text-lg font-bold tracking-tight text-foreground">
            Vero<span className="text-primary">.</span>
          </span>
          <MobileNav allowed={allowed} displayName={displayName} email={email} />
        </header>

        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-5 py-8 md:px-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
