/** Joins class names, skipping falsy values. Safe to call from server and client components. */
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
