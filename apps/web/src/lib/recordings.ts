/*
 * What a recording row says about itself, shared by the host's Recordings tab and the admin
 * list. Pure functions over the session's timestamps so both screens tell the same story and
 * the wording is tested once.
 */

type Timed = { started_at: string | null; ended_at: string | null };

/** "42 min" or "1 h 05 min" from the session's start and end; null until both are known. */
export function recordingLength(s: Timed): string | null {
  if (!s.started_at || !s.ended_at) return null;
  const mins = Math.max(1, Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min` : `${mins} min`;
}

export type Retention =
  /** No expiry stamped: kept until someone deletes it. */
  | { kind: "kept"; label: string }
  /** Expires in more than a week. */
  | { kind: "until"; label: string; days: number }
  /** A week or less left: worth downloading now. */
  | { kind: "soon"; label: string; days: number }
  /** Past its retention; the file is still there until the nightly sweep removes it. */
  | { kind: "expired"; label: string };

/** Where the recording stands against its plan's retention, worded for the row's meta line. */
export function retention(expiresAt: string | null, now = new Date()): Retention {
  if (!expiresAt) return { kind: "kept", label: "Kept" };
  const until = new Date(expiresAt);
  const days = Math.ceil((until.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return { kind: "expired", label: "Past its retention · deleted on the next sweep" };
  const label = `Kept until ${until.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  if (days <= 7) return { kind: "soon", label, days };
  return { kind: "until", label, days };
}
