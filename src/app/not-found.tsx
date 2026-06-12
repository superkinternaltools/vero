import Link from "next/link";
import { Button } from "@/core/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
      <div className="text-7xl font-bold tracking-tight text-primary">404</div>
      <p className="mt-3 text-base text-muted-foreground">
        Looks like you&apos;ve got lost…
      </p>
      <Link href="/" className="mt-7">
        <Button>Back to Dashboard</Button>
      </Link>
    </div>
  );
}
