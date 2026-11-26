/** Only same-origin paths may be a sign-in destination; anything else goes to /week. */
export function safeNext(next: string | null | undefined): string {
  if (!next) return "/week";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/week";
  }
  return next;
}
