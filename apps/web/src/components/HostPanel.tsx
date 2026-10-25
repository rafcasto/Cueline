"use client";
import { DisconnectReason } from "livekit-client";
import { useCallback, useMemo, useState } from "react";
import { ActivityLibrary } from "@/components/ActivityLibrary";
import { AppShell } from "@/components/AppShell";
import { Chat } from "@/components/Chat";
import { EmailSequence } from "@/components/EmailSequence";
import { InviteCard } from "@/components/InviteCard";
import { PresenterDeck } from "@/components/PresenterDeck";
import { Questions } from "@/components/Questions";
import { ReactionBar } from "@/components/ReactionBar";
import { RoomSettings } from "@/components/RoomSettings";
import { RoomStage } from "@/components/RoomStage";
import { RunControls } from "@/components/RunControls";
import { WaitingRoomEditor } from "@/components/WaitingRoomEditor";
import { Alert, Badge, Button, Card, CardHeader, Tabs, type Tone } from "@/components/ui";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { currentRun, latestRun } from "@/lib/session-state";
import { normalizeStageLayout, sameLayout } from "@/lib/stage-layout";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Activity, ChatMessage, Invite, Presentation, Question, ReactionKind, Registration, Room, Session, StageLayout } from "@/lib/supabase/types";

type Props = {
  room: Room;
  initialSession: Session | null;
  userId: string;
  userEmail: string | null;
  presentations: Presentation[];
  activities: Activity[];
  invites: Invite[];
  registrations: Registration[];
};

type Tab = "live" | "event" | "emails" | "waiting" | "settings";

/**
 * Host panel for one room: share the invite link and watch registrations, edit the room's
 * email sequence (inherited by every event), open the room (waiting room), go live, navigate
 * the deck, place the camera on the stage (corner, talking head, side by side, or dragged
 * anywhere), activate activities with timers and reveal results, run the hand-raise queue
 * with promote-to-stage, moderate Q&A, edit the waiting room, and rename or delete the room.
 */
export function HostPanel({ room: initialRoom, initialSession, userId, userEmail, presentations: initialPresentations, activities: initialActivities, invites: initialInvites, registrations: initialRegistrations }: Props) {
  const [room, setRoom] = useState(initialRoom);
  const [invites, setInvites] = useState(initialInvites);
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [session, setSession] = useState<Session | null>(initialSession);
  const [presentations, setPresentations] = useState(initialPresentations);
  const [activities, setActivities] = useState(initialActivities);
  const [deck, setDeck] = useState<Presentation | null>(
    initialPresentations.find((p) => p.id === initialSession?.presentation_id) ?? initialPresentations[0] ?? null,
  );
  const [page, setPage] = useState(0);
  const [stage, setStage] = useState<{ url: string; token: string } | null>(null);
  // The layout with no session open (the room's remembered one), and the host's own change shown at once
  // while the write is in flight: it is keyed to the session layout it replaces, so the broadcast of the
  // same write (or of another tab's) takes over the moment it lands.
  const [draftLayout, setDraftLayout] = useState<StageLayout>(() => normalizeStageLayout(initialRoom.stage_layout));
  const [pendingLayout, setPendingLayout] = useState<{ layout: StageLayout; base: string } | null>(null);
  // Start on the event tab until there is a link to share; the live panel is useless without attendees.
  const [tab, setTab] = useState<Tab>(initialInvites.some((i) => !i.revoked_at) ? "live" : "event");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { state, status } = useSession(session?.id ?? null, { userId, roomId: room.id });
  const live = state.session ?? session;
  const sb = supabaseBrowser();

  const liveLayout = live ? normalizeStageLayout(live.layout) : null;
  const liveLayoutKey = JSON.stringify(liveLayout);
  const layout = liveLayout ? (pendingLayout?.base === liveLayoutKey ? pendingLayout.layout : liveLayout) : draftLayout;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openRoom = () =>
    run(async () => {
      const r = await api<{ session_id: string }>("/api/session/start", { room_slug: room.slug, presentation_id: deck?.id ?? null });
      const { data } = await sb.from("sessions").select("*").eq("id", r.session_id).single();
      setSession(data as Session);
    });
  const goLive = () =>
    run(async () => {
      if (!live) return;
      await api("/api/session/go-live", { session_id: live.id });
      await sb.from("slide_events").insert({ org_id: room.org_id, session_id: live.id, presentation_id: deck?.id ?? null, page_index: page });
    });
  const end = () =>
    run(async () => {
      if (!live) return;
      if (!confirm("End the session for everyone? The recording stops and attendees see the waiting room.")) return;
      await api("/api/session/end", { session_id: live.id });
      setSession(null);
      setStage(null);
    });
  const joinStage = () =>
    run(async () => {
      if (live) setStage(await api<{ url: string; token: string }>("/api/token", { session_id: live.id, role: "presenter" }));
    });

  /** Where the camera sits: attendees follow through the session row; the room remembers it for the next session. */
  const changeLayout = async (next: StageLayout) => {
    const clean = normalizeStageLayout(next);
    if (sameLayout(clean, layout)) return;
    setDraftLayout(clean);
    if (live) setPendingLayout({ layout: clean, base: liveLayoutKey });
    setMsg(null);
    const writes = [sb.from("rooms").update({ stage_layout: clean }).eq("id", room.id)];
    if (live) writes.push(sb.from("sessions").update({ layout: clean }).eq("id", live.id));
    const results = await Promise.all(writes);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setPendingLayout(null);
      setMsg(`Could not save the video placement: ${failed.error.message}`);
    } else setRoom((r) => ({ ...r, stage_layout: clean }));
  };

  const selectDeck = async (p: Presentation | null) => {
    setDeck(p);
    if (live) await sb.from("sessions").update({ presentation_id: p?.id ?? null }).eq("id", live.id);
  };
  const navigate = useCallback(
    async (page_index: number) => {
      setPage(page_index);
      if (!live || live.state !== "live") return;
      await sb.from("slide_events").insert({ org_id: room.org_id, session_id: live.id, presentation_id: deck?.id ?? null, page_index });
    },
    [sb, live, room.org_id, deck],
  );

  // A new run replaces whatever is on screen; the previous run is hidden and closed so it keeps its answers but takes no more.
  const activate = async (a: Activity) => {
    if (!live) return;
    setMsg(null);
    const previous = latestRun(state);
    if (previous && !previous.hidden_at) {
      const now = new Date().toISOString();
      const { error } = await sb.from("activity_runs").update({ hidden_at: now, closed_at: previous.closed_at ?? now }).eq("id", previous.id);
      if (error) return setMsg(error.message);
    }
    const { error } = await sb.from("activity_runs").insert({ org_id: room.org_id, session_id: live.id, activity_id: a.id });
    if (error) setMsg(error.message);
  };

  const stageAction = (action: "invite" | "confirm" | "revoke", user_id: string) =>
    run(async () => {
      if (live) await api("/api/stage", { action, session_id: live.id, user_id });
    });
  const clearHand = (id: string) =>
    run(async () => {
      await sb.from("hand_raises").update({ cleared_at: new Date().toISOString() }).eq("id", id);
    });
  const approve = async (q: Question, approved: boolean) => {
    await sb.from("questions").update({ approved }).eq("id", q.id);
  };
  const answered = async (q: Question) => {
    await sb.from("questions").update({ answered_at: new Date().toISOString() }).eq("id", q.id);
  };
  const sendChat = useCallback(
    async (body: string) => {
      if (!live) return;
      const { error } = await sb.from("chat_messages").insert({ org_id: room.org_id, session_id: live.id, user_id: userId, body });
      if (error) throw new Error(error.message);
    },
    [sb, live, room.org_id, userId],
  );
  const hideChat = async (m: ChatMessage, hidden: boolean) => {
    const { error } = await sb.from("chat_messages").update({ hidden_at: hidden ? new Date().toISOString() : null }).eq("id", m.id);
    if (error) setMsg(error.message);
  };
  const react = useCallback(
    async (kind: ReactionKind, count: number) => {
      if (live) await sb.rpc("bump_reaction", { p_session: live.id, p_kind: kind, p_count: count });
    },
    [sb, live],
  );

  // The controls follow the latest run even while it is hidden, so it can be shown again; the library marks only a visible one as active.
  const currentRunRow = latestRun(state);
  const currentActivity = currentRunRow ? (state.activities[currentRunRow.activity_id] ?? activities.find((a) => a.id === currentRunRow.activity_id)) : null;
  const visibleRun = currentRun(state);
  const participantsCount = Object.keys(state.participants).length;
  const nameOf = (uid: string) => state.participants[uid]?.display_name ?? uid.slice(0, 8);
  const activeInvites = useMemo(() => invites.filter((i) => !i.revoked_at), [invites]);

  const sessionBadge: { tone: Tone; label: string } = live?.state === "live" ? { tone: "live", label: "Live" } : live?.state === "waiting" ? { tone: "brand", label: "Doors open" } : { tone: "neutral", label: "Room closed" };

  return (
    <AppShell
      wide
      crumb={room.name}
      email={userEmail}
      right={
        <Badge tone={sessionBadge.tone} dot={!!live}>
          {sessionBadge.label}
          {live && ` · ${participantsCount} ${participantsCount === 1 ? "person" : "people"}`}
        </Badge>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "live", label: "Live" },
            { value: "event", label: "Event", count: registrations.length },
            { value: "emails", label: "Emails" },
            { value: "waiting", label: "Waiting room" },
            { value: "settings", label: "Settings" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {live && <span className="hidden text-xs text-ink-faint lg:inline">realtime {status}</span>}
          {!live && (
            <Button onClick={() => void openRoom()} loading={busy} variant="secondary">
              Open waiting room
            </Button>
          )}
          {live?.state === "waiting" && (
            <Button onClick={() => void goLive()} loading={busy} variant="success">
              Go live
            </Button>
          )}
          {live && !stage && (
            <Button onClick={() => void joinStage()} loading={busy} variant="primary">
              Join with camera
            </Button>
          )}
          {live && (
            <Button onClick={() => void end()} disabled={busy} variant="danger">
              End session
            </Button>
          )}
        </div>
      </div>
      {msg && (
        <Alert tone="danger" className="mt-4">
          {msg}
        </Alert>
      )}

      <div className="mt-6">
        {tab === "waiting" ? (
          <WaitingRoomEditor room={room} onSaved={(waiting_room) => setRoom({ ...room, waiting_room })} />
        ) : tab === "settings" ? (
          <RoomSettings room={room} hasOpenSession={!!live} onSaved={setRoom} />
        ) : tab === "event" ? (
          <InviteCard room={room} userId={userId} invites={invites} registrations={registrations} participants={state.participants} onInvitesChange={setInvites} onRegistrationsChange={setRegistrations} />
        ) : tab === "emails" ? (
          <EmailSequence room={room} invites={activeInvites} registrations={registrations} />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)]">
            <section className="space-y-6">
              <PresenterDeck
                room={room}
                presentations={presentations}
                onPresentationsChange={setPresentations}
                selected={deck}
                onSelect={(p) => void selectDeck(p)}
                page={page}
                participantsPage={live?.state === "live" ? (state.lastSlide?.page_index ?? 0) : null}
                onNavigate={navigate}
                layout={layout}
                onLayoutChange={(l) => void changeLayout(l)}
                layoutHint={live ? "Attendees follow at once." : "Applies when you open the room."}
                video={
                  stage ? (
                    <RoomStage
                      connection={stage}
                      publish
                      onError={setMsg}
                      onDisconnected={(reason) => {
                        setStage(null);
                        if (reason === DisconnectReason.DUPLICATE_IDENTITY) setMsg("Your camera was disconnected because this account joined the room from another tab or device. Close it, then click \"Join with camera\" again.");
                        else if (reason !== undefined && reason !== DisconnectReason.CLIENT_INITIATED) setMsg(`Your camera was disconnected (${DisconnectReason[reason]}). Click "Join with camera" to rejoin.`);
                      }}
                    />
                  ) : (
                    <CameraPlaceholder live={!!live} />
                  )
                }
              />
              {currentRunRow && currentActivity && live && <RunControls state={state} run={currentRunRow} activity={currentActivity} userId={userId} />}
              <ActivityLibrary roomId={room.id} orgId={room.org_id} activities={activities} onChange={setActivities} onActivate={live?.state === "live" ? activate : undefined} activeId={visibleRun?.activity_id ?? null} />
            </section>

            <aside className="space-y-6">
              {!live && (
                <Alert tone="brand" title="The room is closed">
                  Open the waiting room when you are ready to let registrants in; go live when you start presenting.
                </Alert>
              )}
              {live && (
                <Card>
                  <CardHeader title="Reactions" description="Yours float for everyone too." />
                  <div className="mt-4">
                    <ReactionBar onFlush={react} lastReaction={state.lastReaction} disabled={live.state !== "live"} />
                  </div>
                </Card>
              )}
              <Card>
                <CardHeader title="Hands up" description={state.handRaises.length === 0 ? "Nobody has a hand up." : `${state.handRaises.length} waiting. Promote someone to bring them on stage.`} />
                {state.handRaises.length > 0 && (
                  <ul className="mt-4 divide-y divide-line">
                    {state.handRaises.map((h) => {
                      const rs = state.roster[h.user_id]?.state ?? "viewer";
                      return (
                        <li key={h.id} className="flex items-center gap-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{nameOf(h.user_id)}</span>
                          {rs !== "viewer" && <Badge tone={rs === "live" ? "success" : rs === "invited" ? "brand" : "neutral"}>{rs === "live" ? "On stage" : rs}</Badge>}
                          {rs === "viewer" || rs === "revoked" ? (
                            <Button size="sm" variant="secondary" onClick={() => void stageAction("invite", h.user_id)} disabled={busy}>
                              Promote
                            </Button>
                          ) : rs === "invited" ? (
                            <Button size="sm" variant="success" onClick={() => void stageAction("confirm", h.user_id)} disabled={busy}>
                              Confirm
                            </Button>
                          ) : (
                            <Button size="sm" variant="danger" onClick={() => void stageAction("revoke", h.user_id)} disabled={busy}>
                              Remove
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => void clearHand(h.id)} disabled={busy}>
                            Clear
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {Object.values(state.roster).some((r) => r.state === "live") && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
                    <span className="text-ink-muted">On stage:</span>
                    {Object.values(state.roster)
                      .filter((r) => r.state === "live")
                      .map((r) => (
                        <Button key={r.user_id} size="sm" variant="secondary" onClick={() => void stageAction("revoke", r.user_id)}>
                          {nameOf(r.user_id)} ✕
                        </Button>
                      ))}
                  </div>
                )}
              </Card>
              {live && <Chat host state={state} userId={userId} enabled={room.chat_enabled} onSend={sendChat} onHide={hideChat} />}
              {live && <Questions host state={state} userId={userId} onAsk={async () => undefined} onUpvote={async () => undefined} onApprove={approve} onAnswered={answered} />}
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/** Stands in for the host's camera on the stage until they join with it, so the layout can be set up in advance. */
function CameraPlaceholder({ live }: { live: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-slate-800 px-3 text-center text-slate-300 @container">
      <svg viewBox="0 0 24 24" className="size-6 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="6" width="13" height="12" rx="2" />
        <path d="m16 10 5-3v10l-5-3" />
      </svg>
      <p className="text-xs font-medium leading-tight">Your camera</p>
      <p className="hidden text-xs leading-tight text-slate-400 @[12rem]:block">{live ? "Join with camera to put it here." : "Open the room, then join with camera."}</p>
    </div>
  );
}
