/**
 * Seats and the waiting list, the part that runs on both sides. An event (invite) has a
 * capacity chosen by the host up to the plan's participants-per-session; registrations beyond
 * it wait in order of arrival and move up when a seat frees (someone opts out, the host adds
 * seats, the plan grows). The database decides who sits (register_attendee, promote_waitlist);
 * this file is the arithmetic around it.
 */
import type { PlanLimits } from "@/lib/plans";
import type { InviteEmailKind } from "@/lib/supabase/types";

export type SeatRow = { waitlisted_at: string | null; cancelled_at: string | null };
export type RegistrationStatus = "seated" | "waitlisted" | "cancelled";

export function registrationStatus(r: SeatRow): RegistrationStatus {
  if (r.cancelled_at) return "cancelled";
  if (r.waitlisted_at) return "waitlisted";
  return "seated";
}

export const isSeated = (r: SeatRow) => registrationStatus(r) === "seated";
export const isWaitlisted = (r: SeatRow) => registrationStatus(r) === "waitlisted";

/**
 * The seats an event really has: what the host set, never above the plan's cap, and the plan's
 * cap when the host set nothing. A plan downgrade therefore shrinks every event at once, without
 * unseating anyone already in (register_attendee only ever adds).
 */
export function capacityFor(invite: { capacity: number | null }, limits: Pick<PlanLimits, "participants">): number {
  const max = limits.participants;
  if (invite.capacity === null || invite.capacity === undefined) return max;
  return Math.max(1, Math.min(invite.capacity, max));
}

/** Validate a host's seat count against the plan; the error names the cap. */
export function parseCapacity(raw: unknown, limits: Pick<PlanLimits, "participants" | "label">): { capacity: number | null } | { error: string } {
  if (raw === null || raw === undefined || raw === "") return { capacity: null };
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 1) return { error: "Seats must be a whole number of 1 or more." };
  if (n > limits.participants) return { error: `${limits.label} allows up to ${limits.participants} attendees per session. Raise the plan at /host/billing for more seats.` };
  return { capacity: n };
}

export type SeatSummary = { capacity: number; going: number; waiting: number; left: number; full: boolean };

export function seatSummary(rows: SeatRow[], capacity: number): SeatSummary {
  let going = 0;
  let waiting = 0;
  for (const r of rows) {
    const s = registrationStatus(r);
    if (s === "seated") going++;
    else if (s === "waitlisted") waiting++;
  }
  return { capacity, going, waiting, left: Math.max(0, capacity - going), full: going >= capacity };
}

/** 1-based place in the queue for one waitlisted registration (earliest first), or null when not waiting. */
export function waitlistPosition(rows: (SeatRow & { id: string; created_at: string })[], id: string): number | null {
  const me = rows.find((r) => r.id === id);
  if (!me || !isWaitlisted(me)) return null;
  const key = (r: SeatRow & { created_at: string }) => `${r.waitlisted_at ?? ""}|${r.created_at}`;
  const ahead = rows.filter((r) => isWaitlisted(r) && key(r) < key(me)).length;
  return ahead + 1;
}

/**
 * The email steps one registrant is due, by where they stand: someone on the waiting list gets
 * the waiting-list note and nothing else until a seat opens; someone with a seat gets the
 * welcome and, on a plan that includes them, the reminders. Someone who opted out gets nothing.
 */
export function stepKindsFor(reg: SeatRow, limits: Pick<PlanLimits, "reminders">): InviteEmailKind[] {
  if (reg.cancelled_at) return [];
  if (reg.waitlisted_at) return ["waitlist"];
  return limits.reminders ? ["confirmation", "reminder"] : ["confirmation"];
}
