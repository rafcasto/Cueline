/**
 * Room slugs: the public address of a room (/r/<slug>). Derived from the name, lowercase,
 * letters, digits and hyphens, 3 to 40 characters; the database enforces the same shape.
 */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : base ? `${base}-room`.slice(0, 40) : "room";
}

/** The first of `base`, `base-2`, `base-3`… that `taken` does not contain. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, 40 - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * How many rooms an organisation may have: the plan's included rooms plus the ones it bought.
 * Platform admins are not capped (the caller passes `unlimited`).
 */
export function roomAllowance(limits: { roomsIncluded: number }, extraRooms: number, unlimited = false): number | null {
  if (unlimited) return null;
  return limits.roomsIncluded + Math.max(0, extraRooms);
}

/** Rooms the organisation can still create; null means no limit. */
export function roomsLeft(allowance: number | null, used: number): number | null {
  return allowance === null ? null : Math.max(0, allowance - used);
}
