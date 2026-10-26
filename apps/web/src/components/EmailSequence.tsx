"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatStart } from "@/components/RegisterForm";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Eyebrow, Field, Input, Select, Switch, Textarea, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { describeOffset, PLACEHOLDERS, renderTemplate, templateVars } from "@/lib/email/template";
import type { Plan, PlanLimits } from "@/lib/plans";
import { isSeated } from "@/lib/seats";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Invite, Registration, RegistrationEmail, Room, RoomEmail } from "@/lib/supabase/types";

type Props = {
  room: Room;
  /** The plan in force: reminders go out on the paid plans only. */
  plan: Plan;
  limits: PlanLimits;
  /** Open (not revoked) events in the room; delivery is shown for one of them. */
  invites: Invite[];
  registrations: Registration[];
};

const OFFSETS: { minutes: number; label: string }[] = [
  { minutes: 7 * 1440, label: "1 week before" },
  { minutes: 3 * 1440, label: "3 days before" },
  { minutes: 2880, label: "2 days before" },
  { minutes: 1440, label: "1 day before" },
  { minutes: 720, label: "12 hours before" },
  { minutes: 120, label: "2 hours before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 15, label: "15 minutes before" },
  { minutes: 5, label: "5 minutes before" },
];

type Counts = Record<string, Partial<Record<RegistrationEmail["status"], number>>>;

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/**
 * The room's email sequence: the welcome sent on registration (or the waiting-list note when
 * the seats are gone) plus reminders at fixed times before the start. Every event in the room
 * inherits it; the host edits copy and timing here and the server pushes the change to each
 * open event and reschedules it at Resend against that event's start time. Reminders are a
 * paid feature: on the free plan they are shown locked. Delivery counts are shown for one
 * event at a time.
 */
export function EmailSequence({ room, plan, limits, invites, registrations }: Props) {
  const [steps, setSteps] = useState<RoomEmail[] | null>(null);
  // Delivery counts for the event they were loaded for; an event switch shows nothing until its own arrive.
  const [countsFor, setCountsFor] = useState<{ inviteId: string; counts: Counts } | null>(null);
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<RoomEmail> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sb = supabaseBrowser();

  const invite = invites.find((i) => i.id === inviteId) ?? invites[0] ?? null;
  const counts: Counts = invite && countsFor?.inviteId === invite.id ? countsFor.counts : {};
  const registrationCount = invite ? registrations.filter((r) => r.invite_id === invite.id && isSeated(r)).length : 0;
  const remindersLocked = !limits.reminders;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await sb.from("room_emails").select("*").eq("room_id", room.id).order("minutes_before", { ascending: false, nullsFirst: true });
      if (!cancelled) setSteps((data as RoomEmail[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, room.id]);

  // Delivery for the selected event: its inherited steps, then what Resend was asked for each.
  useEffect(() => {
    if (!invite) return;
    let cancelled = false;
    const id = invite.id;
    (async () => {
      const { data: eventSteps } = await sb.from("invite_emails").select("id, room_email_id").eq("invite_id", id);
      const roomStepOf = new Map<string, string>();
      for (const s of (eventSteps as { id: string; room_email_id: string | null }[]) ?? []) if (s.room_email_id) roomStepOf.set(s.id, s.room_email_id);
      const ids = [...roomStepOf.keys()];
      const { data: rows } = ids.length > 0 ? await sb.from("registration_emails").select("invite_email_id, status").in("invite_email_id", ids) : { data: [] };
      if (cancelled) return;
      const c: Counts = {};
      for (const row of (rows as Pick<RegistrationEmail, "invite_email_id" | "status">[]) ?? []) {
        const key = roomStepOf.get(row.invite_email_id);
        if (!key) continue;
        c[key] = { ...c[key], [row.status]: (c[key]?.[row.status] ?? 0) + 1 };
      }
      setCountsFor({ inviteId: id, counts: c });
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, invite]);

  // Welcome first, then the waiting-list note, then reminders from furthest out to nearest.
  const rank = (s: RoomEmail) => (s.kind === "confirmation" ? 2 : s.kind === "waitlist" ? 1 : 0);
  const sorted = useMemo(() => (steps ?? []).slice().sort((a, b) => rank(b) - rank(a) || (b.minutes_before ?? 0) - (a.minutes_before ?? 0)), [steps]);

  const call = async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const r = await call(() =>
      editing.id
        ? api<{ step: RoomEmail }>("/api/emails/steps", { action: "update", id: editing.id, subject: editing.subject, body: editing.body, minutes_before: editing.kind === "reminder" ? editing.minutes_before : undefined })
        : api<{ step: RoomEmail }>("/api/emails/steps", { action: "create", room_id: room.id, minutes_before: editing.minutes_before, subject: editing.subject, body: editing.body }),
    );
    if (!r) return;
    setSteps((s) => (editing.id ? (s ?? []).map((x) => (x.id === r.step.id ? r.step : x)) : [...(s ?? []), r.step]));
    setEditing(null);
  };
  const toggle = async (step: RoomEmail, enabled: boolean) => {
    setSteps((s) => (s ?? []).map((x) => (x.id === step.id ? { ...x, enabled } : x)));
    const r = await call(() => api<{ step: RoomEmail }>("/api/emails/steps", { action: "update", id: step.id, enabled }));
    if (!r) setSteps((s) => (s ?? []).map((x) => (x.id === step.id ? { ...x, enabled: !enabled } : x)));
  };
  const remove = async (step: RoomEmail) => {
    if (!confirm(`Delete "${step.subject}" from this room's sequence? Scheduled copies for every open event are cancelled.`)) return;
    const r = await call(() => api("/api/emails/steps", { action: "delete", id: step.id }));
    if (r) setSteps((s) => (s ?? []).filter((x) => x.id !== step.id));
  };

  const previewVars = templateVars({
    name: "Ada Lovelace",
    title: invite?.title ?? room.name,
    room: room.name,
    startsAt: invite?.starts_at ?? null,
    timezone: invite?.timezone ?? browserZone(),
    accessToken: "example",
    code: "K7PQ2M",
    appUrl: typeof window === "undefined" ? "" : window.location.origin,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Email sequence"
          description={
            <>
              Every event in <strong className="font-medium text-ink">{room.name}</strong> inherits this sequence. Registrants get the welcome at once and each enabled reminder before that event&apos;s start. Edits reach every open event and move its schedule.
            </>
          }
          actions={
            <Button variant="secondary" size="sm" disabled={!!editing || remindersLocked} onClick={() => setEditing({ kind: "reminder", minutes_before: 60, subject: "", body: "Hi {{first_name}},\n\n{{title}} starts in an hour.\n\nJoin here: {{link}}\n\nNot coming? Free your seat for someone on the waiting list: {{cancel_url}}" })}>
              Add reminder
            </Button>
          }
        />
        {remindersLocked && (
          <Alert tone="brand" className="mt-4" title={plan === "free" ? "Reminders are on Starter and Pro" : "Reminders are not included in this plan"}>
            On {limits.label} every registrant gets the welcome email (and the waiting-list note when the seats are gone); the reminders below stay as they are and are not sent. <Link href="/host/billing" className="font-medium underline underline-offset-4">Upgrade</Link> and they start going out for everyone with a seat at an upcoming event.
          </Alert>
        )}
        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}

        {invites.length === 0 ? (
          <Alert tone="brand" className="mt-4" title="No open event yet">
            The sequence is ready. Create an event on the Event tab and it starts sending to that event&apos;s registrants.
          </Alert>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-inset px-4 py-3 text-sm">
            <span className="text-ink-muted">Delivery for</span>
            {invites.length > 1 ? (
              <Select value={invite?.id ?? ""} onChange={(e) => setInviteId(e.target.value)} className="max-w-xs">
                {invites.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="font-medium text-ink">{invite?.title}</span>
            )}
            {invite && (
              <span className="text-ink-muted">
                {invite.starts_at ? formatStart(invite.starts_at) : "no start time"} · {registrationCount} registered
              </span>
            )}
          </div>
        )}
        {invite && !invite.starts_at && (
          <Alert tone="warning" className="mt-4" title="No start time on this event">
            Reminders count back from the start. Set one on the Event tab and they are scheduled for everyone who has registered.
          </Alert>
        )}

        {editing && (
          <StepEditor
            editing={editing}
            onChange={setEditing}
            onCancel={() => setEditing(null)}
            onSave={() => void save()}
            busy={busy}
            preview={(s) => renderTemplate(s, previewVars)}
          />
        )}

        {steps === null ? (
          <p className="mt-6 text-sm text-ink-muted">Loading the sequence…</p>
        ) : sorted.length === 0 ? (
          <EmptyState className="mt-6" title="No emails in this sequence" description="Add a reminder to start one." />
        ) : (
          <ol className="mt-6 divide-y divide-line">
            {sorted.map((step) => {
              const c = counts[step.id] ?? {};
              const scheduled = (c.scheduled ?? 0) + (c.queued ?? 0);
              const locked = remindersLocked && step.kind === "reminder";
              return (
                <li key={step.id} className={cx("flex flex-wrap items-start gap-4 py-4 first:pt-0 last:pb-0", (!step.enabled || locked) && "opacity-60")}>
                  <div className="w-36 shrink-0 pt-0.5">
                    <Eyebrow>{describeOffset(step.minutes_before, step.kind)}</Eyebrow>
                    <p className="mt-1 text-xs text-ink-faint">{step.kind === "confirmation" ? "Welcome" : step.kind === "waitlist" ? "Waiting list" : "Reminder"}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{renderTemplate(step.subject, previewVars)}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{renderTemplate(step.body, previewVars)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {locked && <Badge tone="brand">Paid plans</Badge>}
                      {c.sent ? <Badge tone="success">{c.sent} sent</Badge> : null}
                      {scheduled ? <Badge tone="brand">{scheduled} scheduled</Badge> : null}
                      {c.failed ? <Badge tone="danger">{c.failed} failed</Badge> : null}
                      {!c.sent && !scheduled && !c.failed && registrationCount > 0 && step.enabled && step.kind === "reminder" && !locked && <span className="text-xs text-ink-faint">Nothing scheduled yet</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch checked={step.enabled} onChange={(v) => void toggle(step, v)} label={`${step.subject} enabled`} disabled={busy || (locked && !step.enabled)} />
                    <Button variant="ghost" size="sm" onClick={() => setEditing(step)} disabled={!!editing || locked}>
                      Edit
                    </Button>
                    {step.kind === "reminder" && (
                      <Button variant="ghost" size="sm" className="text-red-700 hover:text-red-800 dark:text-red-300" onClick={() => void remove(step)} disabled={busy}>
                        Delete
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card className="bg-surface-inset">
        <Eyebrow>Placeholders</Eyebrow>
        <p className="mt-2 text-sm text-ink-muted">Wrap any of these in double braces and they are filled in per registrant, with the title and start time of the event they registered for. The cancel link lets someone who is not coming free their seat for the waiting list.</p>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {PLACEHOLDERS.map((p) => (
            <div key={p} className="flex gap-3">
              <dt className="w-28 shrink-0 font-mono text-xs text-ink">{`{{${p}}}`}</dt>
              <dd className="truncate text-ink-muted">{previewVars[p]}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function StepEditor({ editing, onChange, onCancel, onSave, busy, preview }: { editing: Partial<RoomEmail>; onChange: (s: Partial<RoomEmail>) => void; onCancel: () => void; onSave: () => void; busy: boolean; preview: (s: string) => string }) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const custom = editing.kind === "reminder" && editing.minutes_before !== undefined && !OFFSETS.some((o) => o.minutes === editing.minutes_before);
  return (
    <div className="mt-6 rounded-xl border border-line bg-surface-inset p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{editing.id ? (editing.kind === "confirmation" ? "Edit welcome email" : editing.kind === "waitlist" ? "Edit waiting-list email" : "Edit reminder") : "New reminder"}</h3>
        <div className="flex gap-1 text-sm">
          {(["write", "preview"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cx("rounded-md px-2.5 py-1 font-medium", tab === t ? "bg-surface-raised text-ink shadow-card" : "text-ink-muted hover:text-ink")}>
              {t === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
      </div>
      {tab === "write" ? (
        <div className="mt-4 space-y-4">
          {editing.kind === "reminder" && (
            <Field label="Send" htmlFor="step-offset">
              <div className="flex gap-2">
                <Select id="step-offset" value={custom ? "custom" : String(editing.minutes_before ?? "")} onChange={(e) => onChange({ ...editing, minutes_before: e.target.value === "custom" ? 45 : Number(e.target.value) })} className="max-w-xs">
                  {OFFSETS.map((o) => (
                    <option key={o.minutes} value={o.minutes}>
                      {o.label}
                    </option>
                  ))}
                  <option value="custom">Custom…</option>
                </Select>
                {custom && (
                  <div className="flex items-center gap-2">
                    <Input type="number" min={1} max={86400} value={editing.minutes_before ?? 45} onChange={(e) => onChange({ ...editing, minutes_before: Number(e.target.value) })} className="w-28" />
                    <span className="text-sm text-ink-muted">minutes before</span>
                  </div>
                )}
              </div>
            </Field>
          )}
          <Field label="Subject" htmlFor="step-subject">
            <Input id="step-subject" value={editing.subject ?? ""} maxLength={200} onChange={(e) => onChange({ ...editing, subject: e.target.value })} />
          </Field>
          <Field label="Body" htmlFor="step-body" hint="Plain text. Blank lines become paragraphs; the personal link also becomes a button.">
            <Textarea id="step-body" rows={9} value={editing.body ?? ""} maxLength={5000} onChange={(e) => onChange({ ...editing, body: e.target.value })} className="font-mono text-[13px]" />
          </Field>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-line bg-surface-raised p-5">
          <Eyebrow>Subject</Eyebrow>
          <p className="mt-1 font-medium text-ink">{preview(editing.subject ?? "")}</p>
          <Eyebrow className="mt-4">Body</Eyebrow>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{preview(editing.body ?? "")}</p>
        </div>
      )}
      <div className="mt-5 flex gap-2">
        <Button onClick={onSave} loading={busy} disabled={!editing.subject?.trim() || !editing.body?.trim()}>
          {editing.id ? "Save changes" : "Add reminder"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
