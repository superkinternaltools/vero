export function OrDivider() {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-card px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          or
        </span>
      </div>
    </div>
  );
}
