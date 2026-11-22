"use client";
import { useEffect, useMemo, useState } from "react";
import { formatStart } from "@/components/RegisterForm";
import { SkeletonLine, SkeletonRegion } from "@/components/Skeleton";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Eyebrow, Select, Tabs, cx } from "@/components/ui";
import { DEFAULT_THRESHOLDS, ENGAGEMENT_WEIGHTS, FIT_MAX, QUADRANTS, average, byQuadrant, eventFunnels, scoreAttendees, totalFunnel, type Quadrant, type ScoredAttendee, type Thresholds } from "@/lib/insights";
import { api } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Invite, Registration, Room, Session, SessionEngagement } from "@/lib/supabase/types";

type Props = {
  room: Room;
  invites: Invite[];
  registrations: Registration[];
  /** Sessions of the room that have ended, newest first. */
  pastSessions: Session[];
  /** The open session, if any; its numbers are read live on each refresh. */
  live: Session | null;
  /** Takes the host to where fit scores are set (the activity editor on the Live tab). */
  onAddFitScores?: () => void;
};

/** The grid reads as a chart: intent down the side, fit across the top. */
const GRID: Quadrant[][] = [
  ["eager", "hot"],
  ["cold", "nurture"],
];
type Filter = Quadrant | "unknown" | null;
/** How many sessions get a tab before the rest go into a select. */
const SESSION_TABS = 4;

function shortWhen(iso: string | null) {
  if (!iso) return "not started";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function longWhen(iso: string | null) {
  if (!iso) return "not started";
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * The host's read on a webinar after (or during) the fact. First the thing to act on: the
 * audience of one session scored for engagement (what buyers do) and fit (what their answers
 * said), as a two-by-two with the people in each cell and what to do about them. Then the
 * funnel: registered against attended, per event.
 */
export function InsightsPanel({ room, invites, registrations, pastSessions, live, onAddFitScores }: Props) {
  const sb = supabaseBrowser();
  const sessions = useMemo(() => {
    const list = live && live.started_at ? [live, ...pastSessions] : [...pastSessions];
    return list.filter((s) => s.started_at);
  }, [live, pastSessions]);
  const [sessionId, setSessionId] = useState<string | null>(sessions[0]?.id ?? null);
  const selected = sessions.find((s) => s.id === sessionId) ?? sessions[0] ?? null;

  const [participantsBySession, setParticipantsBySession] = useState<Record<string, string[]>>({});
  const [members, setMembers] = useState<Set<string>>(new Set());
  // The scored rows, keyed to the session they were read for, so switching sessions reads as loading rather than showing the last one's numbers.
  const [held, setHeld] = useState<{ sessionId: string; rows: SessionEngagement[] } | null>(null);
  const rows = held && held.sessionId === selected?.id ? held.rows : null;
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [group, setGroup] = useState<Quadrant>("hot");
  const [filter, setFilter] = useState<Filter>(null);
  const [copied, setCopied] = useState(false);

  // Who was in every session (for the funnel), and who on the team is in the room as a viewer (left out of the scores).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = sessions.map((s) => s.id);
      const [{ data: parts }, { data: team }] = await Promise.all([
        ids.length ? sb.from("participants").select("session_id, user_id").in("session_id", ids) : Promise.resolve({ data: [] as { session_id: string; user_id: string }[] }),
        sb.from("org_members").select("user_id").eq("org_id", room.org_id),
      ]);
      if (cancelled) return;
      const by: Record<string, string[]> = {};
      for (const p of (parts ?? []) as { session_id: string; user_id: string }[]) (by[p.session_id] ??= []).push(p.user_id);
      setParticipantsBySession(by);
      setMembers(new Set(((team ?? []) as { user_id: string }[]).map((m) => m.user_id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, sessions, room.org_id]);

  const selectedId = selected?.id ?? null;
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      let rows: SessionEngagement[];
      try {
        rows = (await api<{ rows: SessionEngagement[] }>("/api/insights", { session_id: selectedId })).rows;
      } catch (err) {
        if (cancelled) return;
        setRefreshing(false);
        return setError((err as Error).message);
      }
      if (cancelled) return;
      setRefreshing(false);
      setError(null);
      setHeld({ sessionId: selectedId, rows });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, reload]);
  const refresh = () => {
    setRefreshing(true);
    setReload((n) => n + 1);
  };
  const pickSession = (id: string) => {
    setSessionId(id);
    setFilter(null);
  };

  const funnels = useMemo(() => eventFunnels(invites, registrations, sessions, participantsBySession), [invites, registrations, sessions, participantsBySession]);
  const totals = totalFunnel(funnels);
  const emailOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of registrations) if (!m.has(r.user_id)) m.set(r.user_id, r.email);
    return m;
  }, [registrations]);

  const audience = useMemo(() => (rows ?? []).filter((r) => !members.has(r.user_id)), [rows, members]);
  const scored = useMemo(() => scoreAttendees(audience, thresholds), [audience, thresholds]);
  const groups = byQuadrant(scored);
  const withFit = scored.filter((a) => a.fit !== null);
  const unknown = scored.filter((a) => a.fit === null);
  const fitUnknown = scored.length > 0 && withFit.length === 0;
  const atDefaults = thresholds.engagement === DEFAULT_THRESHOLDS.engagement && thresholds.fit === DEFAULT_THRESHOLDS.fit;
  const hotAtDefaults = useMemo(() => (atDefaults ? null : byQuadrant(scoreAttendees(audience, DEFAULT_THRESHOLDS)).hot.length), [audience, atDefaults]);
  const listed = filter === null ? scored : filter === "unknown" ? unknown : groups[filter];

  const copyEmails = async (list: ScoredAttendee[]) => {
    const emails = list.map((a) => emailOf.get(a.user_id)).filter((e): e is string => !!e);
    if (emails.length === 0) return;
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt("Copy these addresses", emails.join(", "));
    }
  };

  const tabbed = sessions.slice(0, SESSION_TABS);
  const older = sessions.slice(SESSION_TABS);
  const q = QUADRANTS[group];
  const groupEmails = groups[group].filter((a) => emailOf.has(a.user_id)).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Who to follow up"
          description="Each attendee scored for intent (what they did in the room) and fit (what their answers said), in four groups with the next step for each."
          actions={
            <Button variant="ghost" size="sm" onClick={refresh} loading={refreshing} disabled={!selected}>
              Refresh
            </Button>
          }
        />
        {sessions.length > 1 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Tabs
              value={tabbed.some((s) => s.id === selected?.id) ? (selected?.id ?? "") : "older"}
              onChange={(v) => v !== "older" && pickSession(v)}
              items={[
                ...tabbed.map((s) => ({ value: s.id, label: s.state !== "ended" ? "Live now" : shortWhen(s.started_at) })),
                ...(older.length ? [{ value: "older", label: "Older" }] : []),
              ]}
            />
            {older.length > 0 && (
              <Select aria-label="Older sessions" value={older.some((s) => s.id === selected?.id) ? (selected?.id ?? "") : ""} onChange={(e) => e.target.value && pickSession(e.target.value)} className="w-auto">
                <option value="">Older sessions…</option>
                {older.map((s) => (
                  <option key={s.id} value={s.id}>
                    {longWhen(s.started_at)}
                  </option>
                ))}
              </Select>
            )}
          </div>
        )}
        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}

        {!selected ? (
          <EmptyState className="mt-6" title="No session has gone live yet" description="Insights are per session. Run your webinar; the groups appear here as soon as the first person joins." />
        ) : rows === null ? (
          <SkeletonRegion className="mt-6 space-y-4" label="Loading the audience">
            <SkeletonLine className="h-9 w-40" />
            <div className="grid gap-3 md:grid-cols-2">
              <SkeletonLine className="h-28" />
              <SkeletonLine className="h-28" />
              <SkeletonLine className="h-28" />
              <SkeletonLine className="h-28" />
            </div>
          </SkeletonRegion>
        ) : scored.length === 0 ? (
          <EmptyState className="mt-6" title="Nobody joined this session" description="The scores need attendees in the room. Team members who walk in are left out." />
        ) : (
          <>
            {/* One number leads; the rest of the session in a line under it. */}
            <div className="mt-6">
              <p className="text-xs text-ink-muted">{longWhen(selected.started_at)}{selected.state !== "ended" && " · live now, numbers as of the last refresh"}</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums tracking-tight text-ink">{fitUnknown ? scored.length : groups.hot.length}</span>
                <span className="text-sm font-medium text-ink">{fitUnknown ? "in the room" : "ready to buy"}</span>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {!fitUnknown && `${scored.length} in the room · `}avg engagement {average(scored.map((a) => a.engagement))}
                {withFit.length > 0 && ` · avg fit ${average(withFit.map((a) => a.fit as number))}`} · {scored.filter((a) => a.row.cta_taps > 0).length} tapped the call to action · {scored.filter((a) => a.row.orders_paid > 0).length} paid
              </p>
            </div>

            {fitUnknown ? (
              <EmptyState
                className="mt-6"
                title="No fit scores in this session"
                description={`Give the answers of a poll a fit score (0–${FIT_MAX}) and run it; the four groups need it. Until then everyone is listed by engagement alone.`}
                action={onAddFitScores && <Button onClick={onAddFitScores}>Add fit scores to a poll</Button>}
              />
            ) : (
              <div className="mt-6">
                {/* The matrix: fit across, intent down. Cells are buttons; the chosen one drives the actions and the table. */}
                <div className="grid grid-cols-[auto_1fr] gap-x-2">
                  <div />
                  <div className="mb-2 grid grid-cols-2 gap-3 text-center">
                    <Eyebrow>Low fit</Eyebrow>
                    <Eyebrow>High fit</Eyebrow>
                  </div>
                  <div className="grid grid-rows-2 gap-3">
                    <Eyebrow className="flex items-center justify-center [writing-mode:vertical-rl] rotate-180">High intent</Eyebrow>
                    <Eyebrow className="flex items-center justify-center [writing-mode:vertical-rl] rotate-180">Low intent</Eyebrow>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {GRID.flat().map((cell) => (
                      <QuadrantCell
                        key={cell}
                        quadrant={cell}
                        list={groups[cell]}
                        total={withFit.length}
                        selected={group === cell}
                        filtering={filter === cell}
                        onSelect={() => {
                          setGroup(cell);
                          setFilter(cell);
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Thresholds, as one quiet line; the hot count at the defaults is kept in view so a change is easy to judge. */}
                <p className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 text-xs text-ink-muted">
                  <span>High intent from</span>
                  <ThresholdInput label="High intent threshold" value={thresholds.engagement} onChange={(v) => setThresholds({ ...thresholds, engagement: v })} />
                  <span className="ml-2">High fit from</span>
                  <ThresholdInput label="High fit threshold" value={thresholds.fit} onChange={(v) => setThresholds({ ...thresholds, fit: v })} />
                  {hotAtDefaults !== null && (
                    <span className="ml-2">
                      · {hotAtDefaults} ready to buy at the defaults ·{" "}
                      <button type="button" className="underline underline-offset-4 hover:text-ink" onClick={() => setThresholds(DEFAULT_THRESHOLDS)}>
                        Reset
                      </button>
                    </span>
                  )}
                  {unknown.length > 0 && (
                    <span className="ml-2">
                      · {unknown.length} answered no fit question,{" "}
                      <button type="button" className="underline underline-offset-4 hover:text-ink" onClick={() => setFilter("unknown")}>
                        show them
                      </button>
                    </span>
                  )}
                </p>

                {/* What to do about the chosen group. */}
                <div className="mt-6 rounded-lg bg-surface-inset p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 max-w-prose">
                      <Eyebrow>
                        {q.intent} · {q.fit}
                      </Eyebrow>
                      <h3 className="mt-1 text-base font-semibold text-ink">
                        {q.title}
                        <span className="ml-2 text-sm font-normal text-ink-muted">
                          {groups[group].length} {groups[group].length === 1 ? "person" : "people"}
                        </span>
                      </h3>
                      <p className="mt-1 text-sm text-ink-muted">{q.summary}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant={copied ? "success" : "secondary"} onClick={() => void copyEmails(groups[group])} disabled={groupEmails === 0}>
                        {copied ? <CheckIcon /> : <ClipboardIcon />}
                        {copied ? "Copied" : `Copy ${groupEmails} ${groupEmails === 1 ? "email" : "emails"}`}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setFilter(filter === group ? null : group)}>
                        {filter === group ? "Show everyone" : "Show in table"}
                      </Button>
                    </div>
                  </div>
                  <ol className="mt-4 max-w-prose list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
                    {q.actions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
              <Eyebrow>
                {filter === null ? "Everyone" : filter === "unknown" ? "No fit answer" : QUADRANTS[filter].title} · {listed.length}
              </Eyebrow>
              {filter !== null && (
                <button type="button" className="text-xs text-ink-muted underline underline-offset-4 hover:text-ink" onClick={() => setFilter(null)}>
                  Show everyone
                </button>
              )}
            </div>
            <div className="-mx-6 mt-2 overflow-x-auto px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    <th className="py-2 pr-4 font-semibold">Attendee</th>
                    <th className="py-2 pr-4 font-semibold">Email</th>
                    <th className="py-2 pr-4 font-semibold">Engagement</th>
                    <th className="py-2 pr-4 font-semibold">Fit</th>
                    <th className="py-2 pr-4 font-semibold">Group</th>
                    <th className="py-2 font-semibold">Signals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {listed.map((a) => (
                    <tr key={a.user_id}>
                      <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-ink">{a.display_name}</td>
                      <td className="max-w-56 truncate py-2.5 pr-4 text-ink-muted">{emailOf.get(a.user_id) ?? <span className="text-ink-faint">no registration</span>}</td>
                      <td className="py-2.5 pr-4">
                        <ScoreBar value={a.engagement} />
                      </td>
                      <td className="py-2.5 pr-4">{a.fit === null ? <span className="text-ink-faint">—</span> : <ScoreBar value={a.fit} />}</td>
                      <td className="py-2.5 pr-4">{a.quadrant ? <Badge tone={a.quadrant === "hot" ? "success" : "neutral"}>{QUADRANTS[a.quadrant].title}</Badge> : <span className="text-ink-faint">—</span>}</td>
                      <td className="max-w-md py-2.5 text-sm text-ink-muted">{a.signals.length ? a.signals.join(" · ") : "turned up"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="mt-6 max-w-prose text-sm text-ink-muted">
              <summary className="cursor-pointer font-medium text-ink">How the scores work</summary>
              <p className="mt-2 leading-relaxed">
                <strong className="font-medium text-ink">Engagement</strong> (0–100) is the share of what was possible in this session: turning up ({ENGAGEMENT_WEIGHTS.present}), answering the polls ({ENGAGEMENT_WEIGHTS.answers} for all of them), asking a question ({ENGAGEMENT_WEIGHTS.question}, {ENGAGEMENT_WEIGHTS.secondQuestion} more for a second), chatting ({ENGAGEMENT_WEIGHTS.chat}), upvoting ({ENGAGEMENT_WEIGHTS.upvotes}), reacting ({ENGAGEMENT_WEIGHTS.reactions}), a hand up ({ENGAGEMENT_WEIGHTS.handRaise}) and tapping a call to action ({ENGAGEMENT_WEIGHTS.ctaTap}). A paid order scores 100. A session with no polls or calls to action holds neither against anyone.
              </p>
              <p className="mt-2 leading-relaxed">
                <strong className="font-medium text-ink">Fit</strong> (0–100) is the fit of the answers a person picked over the best possible across every fit-scored poll the session ran; someone who answered none of them has no fit and no group. Team members in the room are left out of both.
              </p>
            </details>
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Registered against attended" description="Per event: who registered, and who turned up to the session that ran for it." />
        {funnels.length === 0 ? (
          <EmptyState className="mt-6" title="No events yet" description="Create an event on the Event tab; registrations and attendance show up here." />
        ) : (
          <>
            <div className="mt-6">
              <p className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums tracking-tight text-ink">{totals.showUp === null ? "—" : `${totals.showUp}%`}</span>
                <span className="text-sm font-medium text-ink">show-up</span>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {totals.attended} attended of {totals.registered} registered
                {totals.waiting > 0 && ` · ${totals.waiting} waiting`}
                {totals.cancelled > 0 && ` · ${totals.cancelled} opted out`}
              </p>
            </div>
            <div className="-mx-6 mt-4 overflow-x-auto px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    <th className="py-2 pr-4 font-semibold">Event</th>
                    <th className="py-2 pr-4 font-semibold">When</th>
                    <th className="py-2 pr-4 text-right font-semibold">Registered</th>
                    <th className="py-2 pr-4 text-right font-semibold">Attended</th>
                    <th className="py-2 text-right font-semibold">Show-up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {funnels.map((f) => (
                    <tr key={f.event.id} className={f.event.revoked_at ? "opacity-60" : undefined}>
                      <td className="max-w-56 truncate py-2.5 pr-4 font-medium text-ink">
                        {f.event.title}
                        {f.event.revoked_at && <Badge className="ml-2">Revoked</Badge>}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-ink-muted">{f.event.starts_at ? formatStart(f.event.starts_at) : "No start time"}</td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-right tabular-nums text-ink">
                        {f.registered}
                        {(f.waiting > 0 || f.cancelled > 0) && (
                          <span className="text-xs text-ink-muted">
                            {f.waiting > 0 && ` · ${f.waiting} waiting`}
                            {f.cancelled > 0 && ` · ${f.cancelled} out`}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-right tabular-nums text-ink">
                        {f.attended}
                        {f.sessions.length === 0 && f.registered > 0 && (
                          <span className="ml-1 text-xs text-ink-faint" title="No session has run within twelve hours of this event's start time yet">
                            no session yet
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-ink">{f.showUp === null ? <span className="text-ink-faint">—</span> : `${f.showUp}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="mt-4 max-w-prose text-sm text-ink-muted">
              <summary className="cursor-pointer font-medium text-ink">How attendance is matched</summary>
              <p className="mt-2 leading-relaxed">
                A registrant counts as attended when the identity their registration is bound to joined one of the event&apos;s sessions: the sessions that started within twelve hours of a timed event&apos;s start, or any session while an untimed link was live. Registered is everyone who did not opt out, seated or waiting.
              </p>
            </details>
          </>
        )}
      </Card>
    </div>
  );
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-surface-inset">
        <div className="h-2 rounded-full bg-brand" style={{ width: `${value}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-ink-muted">{value}</span>
    </div>
  );
}

function ThresholdInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={100}
      aria-label={label}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n) && n >= 1 && n <= 100) onChange(n);
      }}
      className="h-7 w-14 rounded-md border border-line bg-surface-raised px-2 text-center text-xs tabular-nums text-ink focus-visible:outline-none focus:ring-2 focus:ring-focus"
    />
  );
}

/** One cell of the matrix: the count leads, a few names follow; the ready-to-buy cell is the only coloured one. */
function QuadrantCell({ quadrant, list, total, selected, filtering, onSelect }: { quadrant: Quadrant; list: ScoredAttendee[]; total: number; selected: boolean; filtering: boolean; onSelect: () => void }) {
  const q = QUADRANTS[quadrant];
  const shown = list.slice(0, 3);
  const hot = quadrant === "hot";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        "min-h-28 rounded-xl border p-4 text-left transition-colors",
        hot ? "border-success/30 bg-success-soft shadow-card" : "border-line bg-surface-raised hover:bg-surface-inset",
        selected && "ring-2 ring-focus ring-offset-2 ring-offset-surface-raised",
      )}
    >
      <p className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-ink">{list.length}</span>
        <span className="text-xs tabular-nums text-ink-muted">{total ? `${Math.round((list.length / total) * 100)}%` : "—"}</span>
      </p>
      <p className="mt-1 text-sm font-medium text-ink">{q.title}</p>
      <p className="mt-1 truncate text-xs text-ink-muted">
        {list.length === 0 ? "Nobody here" : shown.map((a) => a.display_name).join(", ")}
        {list.length > shown.length && ` and ${list.length - shown.length} more`}
      </p>
      {filtering && <Badge tone="brand" className="mt-2">In the table</Badge>}
    </button>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
