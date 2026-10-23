"use client";
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Eyebrow, Field, Input, Select, Switch, Textarea, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { describeOffset, PLACEHOLDERS, renderTemplate, templateVars } from "@/lib/email/template";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Invite, InviteEmail, RegistrationEmail, Room } from "@/lib/supabase/types";

type Props = { room: Room; invite: Invite; registrationCount: number };

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

/**
 * The anticipation sequence for one event: the confirmation plus reminders at fixed times
 * before the start. Hosts edit copy and timing here; the server reschedules at Resend.
 */
export function EmailSequence({ room, invite, registrationCount }: Props) {
  const [steps, setSteps] = useState<InviteEmail[] | null>(null);
  const [counts, setCounts] = useState<Counts>({});
  const [editing, setEditing] = useState<Partial<InviteEmail> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sb = supabaseBrowser();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: s }, { data: r }] = await Promise.all([
        sb.from("invite_emails").select("*").eq("invite_id", invite.id).order("minutes_before", { ascending: false, nullsFirst: true }),
        sb.from("registration_emails").select("invite_email_id, status").eq("org_id", invite.org_id),
      ]);
      if (cancelled) return;
      setSteps((s as InviteEmail[]) ?? []);
      const c: Counts = {};
      for (const row of (r as Pick<RegistrationEmail, "invite_email_id" | "status">[]) ?? []) {
        c[row.invite_email_id] = { ...c[row.invite_email_id], [row.status]: (c[row.invite_email_id]?.[row.status] ?? 0) + 1 };
      }
      setCounts(c);
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, invite.id, invite.org_id]);

  const sorted = useMemo(() => (steps ?? []).slice().sort((a, b) => (b.minutes_before ?? Infinity) - (a.minutes_before ?? Infinity)), [steps]);

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
        ? api<{ step: InviteEmail }>("/api/emails/steps", { action: "update", id: editing.id, subject: editing.subject, body: editing.body, minutes_before: editing.kind === "reminder" ? editing.minutes_before : undefined })
        : api<{ step: InviteEmail }>("/api/emails/steps", { action: "create", invite_id: invite.id, minutes_before: editing.minutes_before, subject: editing.subject, body: editing.body }),
    );
    if (!r) return;
    setSteps((s) => (editing.id ? (s ?? []).map((x) => (x.id === r.step.id ? r.step : x)) : [...(s ?? []), r.step]));
    setEditing(null);
  };
  const toggle = async (step: InviteEmail, enabled: boolean) => {
    setSteps((s) => (s ?? []).map((x) => (x.id === step.id ? { ...x, enabled } : x)));
    const r = await call(() => api<{ step: InviteEmail }>("/api/emails/steps", { action: "update", id: step.id, enabled }));
    if (!r) setSteps((s) => (s ?? []).map((x) => (x.id === step.id ? { ...x, enabled: !enabled } : x)));
  };
  const remove = async (step: InviteEmail) => {
    if (!confirm(`Delete "${step.subject}"? Scheduled copies of it are cancelled.`)) return;
    const r = await call(() => api("/api/emails/steps", { action: "delete", id: step.id }));
    if (r) setSteps((s) => (s ?? []).filter((x) => x.id !== step.id));
  };

  const previewVars = templateVars({
    name: "Ada Lovelace",
    title: invite.title,
    room: room.name,
    startsAt: invite.starts_at,
    timezone: invite.timezone,
    accessToken: "example",
    code: "K7PQ2M",
    appUrl: typeof window === "undefined" ? "" : window.location.origin,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Event emails"
          description={
            <>
              Every registrant gets the confirmation at once and each enabled reminder before the start of <strong className="font-medium text-ink">{invite.title}</strong>. Edits apply to everyone already registered; the schedule moves if you change the start time.
            </>
          }
          actions={
            <Button variant="secondary" size="sm" disabled={!!editing} onClick={() => setEditing({ kind: "reminder", minutes_before: 60, subject: "", body: "Hi {{first_name}},\n\n{{title}} starts in an hour.\n\nJoin here: {{link}}" })}>
              Add reminder
            </Button>
          }
        />
        {!invite.starts_at && (
          <Alert tone="warning" className="mt-4" title="No start time on this event">
            Reminders need a start time to count back from. Set one on the Event tab and they are scheduled for everyone who has registered.
          </Alert>
        )}
        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
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
              return (
                <li key={step.id} className={cx("flex flex-wrap items-start gap-4 py-4 first:pt-0 last:pb-0", !step.enabled && "opacity-60")}>
                  <div className="w-36 shrink-0 pt-0.5">
                    <Eyebrow>{describeOffset(step.minutes_before)}</Eyebrow>
                    <p className="mt-1 text-xs text-ink-faint">{step.kind === "confirmation" ? "Confirmation" : "Reminder"}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{renderTemplate(step.subject, previewVars)}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{renderTemplate(step.body, previewVars)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {c.sent ? <Badge tone="success">{c.sent} sent</Badge> : null}
                      {scheduled ? <Badge tone="brand">{scheduled} scheduled</Badge> : null}
                      {c.failed ? <Badge tone="danger">{c.failed} failed</Badge> : null}
                      {!c.sent && !scheduled && !c.failed && registrationCount > 0 && step.enabled && step.kind === "reminder" && <span className="text-xs text-ink-faint">Nothing scheduled yet</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch checked={step.enabled} onChange={(v) => void toggle(step, v)} label={`${step.subject} enabled`} disabled={busy} />
                    <Button variant="ghost" size="sm" onClick={() => setEditing(step)} disabled={!!editing}>
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
        <p className="mt-2 text-sm text-ink-muted">Wrap any of these in double braces and they are filled in per registrant.</p>
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

function StepEditor({ editing, onChange, onCancel, onSave, busy, preview }: { editing: Partial<InviteEmail>; onChange: (s: Partial<InviteEmail>) => void; onCancel: () => void; onSave: () => void; busy: boolean; preview: (s: string) => string }) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const custom = editing.kind === "reminder" && editing.minutes_before !== undefined && !OFFSETS.some((o) => o.minutes === editing.minutes_before);
  return (
    <div className="mt-6 rounded-xl border border-line bg-surface-inset p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{editing.id ? "Edit email" : "New reminder"}</h3>
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
