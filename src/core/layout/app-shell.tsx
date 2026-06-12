import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { signOutAction } from "@/modules/auth/actions";
import { LogOut } from "lucide-react";

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
          <form action={signOutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </header>

        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-5 py-8 md:px-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
