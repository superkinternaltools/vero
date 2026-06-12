/** Tiny className joiner (filters falsy values). Avoids extra deps for now. */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}
