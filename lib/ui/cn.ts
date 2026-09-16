/** Tiny class-name joiner: drops falsy values, no dedupe (Tailwind ordering is stable enough). */
export function cn(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(" ");
}
