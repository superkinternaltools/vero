import type { InputHTMLAttributes } from "react";
import { cn } from "@/core/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-transparent bg-input px-4 py-3 text-sm text-foreground transition",
        "placeholder:text-muted-foreground",
        "focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30",
        className,
      )}
      {...props}
    />
  );
}
