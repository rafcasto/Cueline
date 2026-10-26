"use client";
import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { formatStart } from "@/components/RegisterForm";
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, EmptyState, Eyebrow, Field, Input, Stat, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import type { PlanLimits } from "@/lib/plans";
import { capacityFor, isSeated, registrationStatus, seatSummary, waitlistPosition } from "@/lib/seats";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Invite, Participant, Registration, Room } from "@/lib/supabase/types";

type Props = {
  room: Room;
  /** The plan's cap on seats per event. */
  limits: PlanLimits;
  invites: Invite[];
  registrations: Registration[];
  /** Who is in the open session, to mark which registrants have actually joined. */
  participants: Record<string, Participant>;
  onInvitesChange: (invites: Invite[]) => void;
  onRegistrationsChange: (registrations: Registration[]) => void;
};

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** datetime-local wants local wall-clock time without a zone. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Draft = { id?: string; title: string; startsAt: string; description: string; isPublic: boolean; capacity: string };

/**
 * Organiser side of an event: create the invite link, copy it, edit the details and the seat
 * count, watch registrations arrive (seated, waiting, opted out), revoke it. The numbers that
 * matter sit at the top: seats taken, people waiting, people in the room.
 */
export function InviteCard({ room, limits, invites, registrations, participants, onInvitesChange, onRegistrationsChange }: Props) {
  const sb = supabaseBrowser();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Absolute link for copying; empty on the server so hydration matches.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const active = invites.filter((i) => !i.revoked_at);
  const revokedCount = invites.length - active.length;

  const refresh = useCallback(async () => {
    const { data } = await sb.from("registrations").select("*").eq("room_id", room.id).order("created_at", { ascending: false });
    if (data) onRegistrationsChange(data as Registration[]);
  }, [sb, room.id, onRegistrationsChange]);

  // Registrations are written by the server, not broadcast; poll gently while this tab is open.
  useEffect(() => {
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const starts_at = draft.startsAt ? new Date(draft.startsAt).toISOString() : null;
      const capacity = draft.capacity.trim() === "" ? null : Number(draft.capacity);
      if (draft.id) {
        const r = await api<{ invite: Invite }>("/api/invites/update", { id: draft.id, title: draft.title, description: draft.description || null, starts_at, timezone: browserZone(), is_public: draft.isPublic, capacity });
        onInvitesChange(invites.map((i) => (i.id === r.invite.id ? r.invite : i)));
        void refresh();
      } else {
        const r = await api<{ invite: Invite }>("/api/invites/create", { room_id: room.id, title: draft.title.trim() || room.name, description: draft.description.trim() || null, starts_at, timezone: browserZone(), is_public: draft.isPublic, capacity });
        onInvitesChange([r.invite, ...invites]);
      }
      setDraft(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (inv: Invite) => {
    if (!confirm("Revoke this link? People who already registered keep their access; nobody new can register with it.")) return;
    const revoked_at = new Date().toISOString();
    const { error } = await sb.from("invites").update({ revoked_at }).eq("id", inv.id);
    if (error) return setError(error.message);
    onInvitesChange(invites.map((i) => (i.id === inv.id ? { ...i, revoked_at } : i)));
  };

  const copy = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      prompt("Copy this link", url);
    }
  };

  const seated = registrations.filter(isSeated);
  const waiting = registrations.filter((r) => registrationStatus(r) === "waitlisted");
  const joinedCount = seated.filter((r) => participants[r.user_id]).length;
  const newDraft = () => setDraft({ title: room.name, startsAt: "", description: "", isPublic: room.is_public, capacity: "" });
  const seatsOf = (inv: Invite) => seatSummary(registrations.filter((r) => r.invite_id === inv.id), capacityFor(inv, limits));
  const capped = (inv: Invite) => inv.capacity !== null && inv.capacity > limits.participants;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Event and invite link"
          description={`Attendees register with a name and email on the link and get a confirmation with their personal link and code. Each event has the seats you give it, up to ${limits.participants} on ${limits.label}; when they are gone, new registrants join a waiting list and move up as people opt out.`}
          actions={
            <div className="flex gap-8">
              <Stat value={seated.length} label="Seated" />
              <Stat value={waiting.length} label="Waiting" />
              <Stat value={joinedCount} label="Joined" />
            </div>
          }
        />
        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}

        {active.length === 0 && !draft && (
          <EmptyState
            className="mt-6"
            title="No invite link yet"
            description={`Without one nobody can get into /r/${room.slug}. Create the event and share the link.`}
            action={<Button onClick={newDraft}>Create invite link</Button>}
          />
        )}

        <div className="mt-6 space-y-4">
          {active.map((inv) => {
            const url = `${origin}/join/${inv.token}`;
            const seats = seatsOf(inv);
            return (
              <div key={inv.id} className="rounded-xl border border-line p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-ink">{inv.title}</h3>
                      <Badge tone="success" dot>
                        Open
                      </Badge>
                      {seats.full && <Badge tone="warning">Full</Badge>}
                      {inv.is_public && <Badge tone={room.is_public ? "brand" : "warning"}>{room.is_public ? "On Explore" : "Public, room not listed"}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">
                      {inv.starts_at ? formatStart(inv.starts_at) : "No start time set"} · {seats.going} of {seats.capacity} seats taken
                      {seats.waiting > 0 ? ` · ${seats.waiting} waiting` : ""}
                      {inv.capacity === null ? " (plan maximum)" : ""}
                    </p>
                    {capped(inv) && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Set to {inv.capacity} seats, but {limits.label} allows {limits.participants}; the lower number applies until the plan changes.</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setDraft({ id: inv.id, title: inv.title, startsAt: toLocalInput(inv.starts_at), description: inv.description ?? "", isPublic: inv.is_public, capacity: inv.capacity === null ? "" : String(inv.capacity) })} disabled={!!draft}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-700 hover:text-red-800 dark:text-red-300" onClick={() => void revoke(inv)}>
                      Revoke
                    </Button>
                  </div>
                </div>
                <div className="mt-4">
                  <Eyebrow>Invite link</Eyebrow>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" />
                    <Button variant={copied === inv.id ? "success" : "primary"} onClick={() => void copy(url, inv.id)} className="w-24">
                      {copied === inv.id ? "Copied" : "Copy"}
                    </Button>
                    <ButtonLink href={url} external variant="secondary">
                      Open
                    </ButtonLink>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {draft ? (
          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4 rounded-xl border border-line bg-surface-inset p-5">
            <h3 className="text-sm font-semibold text-ink">{draft.id ? "Edit event" : "New event"}</h3>
            <Field label="Webinar title" htmlFor="inv-title">
              <Input id="inv-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={200} required />
            </Field>
            <Field label="Starts" htmlFor="inv-start" hint={`Your timezone (${browserZone()}). Reminder emails count back from this.`}>
              <Input id="inv-start" type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} className="max-w-xs" />
            </Field>
            <Field label="Seats" htmlFor="inv-seats" hint={`Up to ${limits.participants} on ${limits.label}; leave blank for the maximum. Once the seats are taken, new registrants join a waiting list and move up when someone opts out or you add seats.`}>
              <Input id="inv-seats" type="number" inputMode="numeric" min={1} max={limits.participants} step={1} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} placeholder={String(limits.participants)} className="max-w-xs" />
            </Field>
            <Field label="What attendees will see" htmlFor="inv-desc" hint="Optional. Shown on the registration page and on Explore.">
              <Textarea id="inv-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={2000} rows={3} />
            </Field>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={draft.isPublic} onChange={(e) => setDraft({ ...draft, isPublic: e.target.checked })} className="mt-0.5 size-4 accent-brand" />
              <span>
                <span className="font-medium text-ink">List on Explore</span>
                <span className="block text-ink-muted">
                  Anyone browsing tertulia.cloud/explore can find it and register.{" "}
                  {room.is_public ? "The room is listed." : "The room is not listed yet; turn on Public listing in Settings or the event stays hidden."}
                </span>
              </span>
            </label>
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>
                {draft.id ? "Save changes" : "Create link"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          active.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={newDraft}>
                New link for another event
              </Button>
              {revokedCount > 0 && (
                <span className="text-xs text-ink-faint">
                  {revokedCount} earlier {revokedCount === 1 ? "link" : "links"} revoked
                </span>
              )}
            </div>
          )
        )}
      </Card>

      <Card>
        <CardHeader
          title="Registrations"
          description="Each attendee's code lets them in from any device with their email; their personal link does the same with no typing. People who opt out free their seat for the next in line."
          actions={
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              Refresh
            </Button>
          }
        />
        {registrations.length === 0 ? (
          <EmptyState className="mt-6" title="Nobody has registered yet" description="Share the invite link. Registrations appear here within a few seconds." />
        ) : (
          <div className="-mx-6 mt-4 overflow-x-auto px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  <th className="py-2 pr-4 font-semibold">Name</th>
                  <th className="py-2 pr-4 font-semibold">Email</th>
                  {active.length > 1 && <th className="py-2 pr-4 font-semibold">Event</th>}
                  <th className="py-2 pr-4 font-semibold">Seat</th>
                  <th className="py-2 pr-4 font-semibold">Code</th>
                  <th className="py-2 pr-4 font-semibold">Registered</th>
                  <th className="py-2 font-semibold">In room</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {registrations.map((r) => {
                  const status = registrationStatus(r);
                  const position = status === "waitlisted" ? waitlistPosition(registrations.filter((x) => x.invite_id === r.invite_id), r.id) : null;
                  return (
                    <tr key={r.id} className={status === "cancelled" ? "opacity-60" : undefined}>
                      <td className="py-2.5 pr-4 font-medium text-ink">{r.name}</td>
                      <td className="py-2.5 pr-4 text-ink-muted">{r.email}</td>
                      {active.length > 1 && <td className="max-w-40 truncate py-2.5 pr-4 text-ink-muted">{invites.find((i) => i.id === r.invite_id)?.title ?? "—"}</td>}
                      <td className="py-2.5 pr-4">
                        {status === "seated" ? <Badge tone="success">Seated</Badge> : status === "waitlisted" ? <Badge tone="warning">{position ? `Waiting #${position}` : "Waiting"}</Badge> : <Badge>Opted out</Badge>}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs tracking-widest text-ink">{r.code}</td>
                      <td className="py-2.5 pr-4 text-ink-muted">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-2.5">{participants[r.user_id] && status === "seated" ? <Badge tone="success">In room</Badge> : <span className="text-ink-faint">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
