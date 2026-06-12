import type { ReactNode } from "react";

/** Clean, minimal shell for auth pages. Neutral canvas; red only as accent. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex items-center text-2xl font-bold tracking-tight text-foreground">
        Vero<span className="text-primary">.</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 text-xs text-muted-foreground">SuperK · Execution Proof</p>
    </div>
  );
}
