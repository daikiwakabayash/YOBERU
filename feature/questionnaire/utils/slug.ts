/**
 * Normalize a questionnaire slug to URL-safe form:
 *  - trim whitespace
 *  - lowercase
 *  - replace spaces / underscores with hyphens
 *  - remove characters that aren't a-z, 0-9, ., -
 *  - collapse consecutive hyphens
 *  - drop leading/trailing hyphens
 *
 * Pure synchronous helper. Lives outside the "use server" service module
 * so it can be imported by both server actions and lookup helpers as a
 * plain function call (no Server Action round-trip / wrapping).
 */
export function sanitizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
