"use client";
import { useCallback, useState } from "react";
import { ActivityLibrary } from "@/components/ActivityLibrary";
import { InviteCard } from "@/components/InviteCard";
import { PresenterDeck } from "@/components/PresenterDeck";
import { Questions } from "@/components/Questions";
import { ReactionBar } from "@/components/ReactionBar";
import { RoomStage } from "@/components/RoomStage";
import { RunControls } from "@/components/RunControls";
import { WaitingRoomEditor } from "@/components/WaitingRoomEditor";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { currentRun } from "@/lib/session-state";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Activity, Invite, Presentation, Question, ReactionKind, Registration, Room, Session } from "@/lib/supabase/types";

type Props = {
  room: Room;
  initialSession: Session | null;
  userId: string;
  presentations: Presentation[];
  activities: Activity[];
  invites: Invite[];
  registrations: Registration[];
};

/**
 * Host panel: share the invite link and watch registrations, open the room
 * (waiting room), go live, navigate the deck, activate activities with timers
 * and reveal results, run the hand-raise queue with promote-to-stage, moderate
 * Q&A, and edit the waiting room.
 */
export function HostPanel({ room: initialRoom, initialSession, userId, presentations: initialPresentations, activities: initialActivities, invites: initialInvites, registrations: initialRegistrations }: Props) {
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
  // Start on the invite tab until there is a link to share; the live panel is useless without attendees.
  const [tab, setTab] = useState<"live" | "invite" | "waiting">(initialInvites.some((i) => !i.revoked_at) ? "live" : "invite");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { state, status } = useSession(session?.id ?? null, { userId, roomId: room.id });
  const live = state.session ?? session;
  const sb = supabaseBrowser();

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
      await api("/api/session/end", { session_id: live.id });
      setSession(null);
      setStage(null);
    });
  const joinStage = () => run(async () => { if (live) setStage(await api<{ url: string; token: string }>("/api/token", { session_id: live.id, role: "presenter" })); });

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

  const activate = async (a: Activity) => {
    if (!live) return;
    const current = currentRun(state);
    if (current && !current.hidden_at) await sb.from("activity_runs").update({ hidden_at: new Date().toISOString(), closed_at: current.closed_at ?? new Date().toISOString() }).eq("id", current.id);
    const { error } = await sb.from("activity_runs").insert({ org_id: room.org_id, session_id: live.id, activity_id: a.id });
    if (error) setMsg(error.message);
  };

  const stageAction = (action: "invite" | "confirm" | "revoke", user_id: string) => run(async () => { if (live) await api("/api/stage", { action, session_id: live.id, user_id }); });
  const clearHand = (id: string) => run(async () => { await sb.from("hand_raises").update({ cleared_at: new Date().toISOString() }).eq("id", id); });
  const approve = async (q: Question, approved: boolean) => { await sb.from("questions").update({ approved }).eq("id", q.id); };
  const answered = async (q: Question) => { await sb.from("questions").update({ answered_at: new Date().toISOString() }).eq("id", q.id); };
  const react = useCallback(async (kind: ReactionKind, count: number) => { if (live) await sb.rpc("bump_reaction", { p_session: live.id, p_kind: kind, p_count: count }); }, [sb, live]);

  const currentRunRow = currentRun(state);
  const currentActivity = currentRunRow ? state.activities[currentRunRow.activity_id] ?? activities.find((a) => a.id === currentRunRow.activity_id) : null;
  const participantsCount = Object.keys(state.participants).length;
  const nameOf = (uid: string) => state.participants[uid]?.display_name ?? uid.slice(0, 8);

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{room.name} · host</h1>
          <p className="text-xs text-neutral-500">
            {invites.some((i) => !i.revoked_at) ? `${registrations.length} registered` : "no invite link yet"} ·{" "}
            {live ? `${live.state} · ${participantsCount} participants · ${status}` : "room closed"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" className="flex rounded border text-sm dark:border-neutral-700">
            {(["live", "invite", "waiting"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 first:rounded-l last:rounded-r ${tab === t ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900" : ""}`}
              >
                {t === "live" ? "Live panel" : t === "invite" ? "Invite & registrations" : "Waiting room"}
              </button>
            ))}
          </div>
          {!live && <button onClick={() => void openRoom()} disabled={busy} className="rounded bg-neutral-800 px-3 py-1 text-white disabled:opacity-50 dark:bg-neutral-200 dark:text-neutral-900">Open waiting room</button>}
          {live?.state === "waiting" && <button onClick={() => void goLive()} disabled={busy} className="rounded bg-green-600 px-3 py-1 text-white disabled:opacity-50">Go live</button>}
          {live && !stage && <button onClick={() => void joinStage()} disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-white disabled:opacity-50">Join with camera</button>}
          {live && <button onClick={() => void end()} disabled={busy} className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50">End session</button>}
        </div>
      </header>
      {msg && <p className="rounded bg-neutral-100 p-2 text-sm dark:bg-neutral-800">{msg}</p>}

      {tab === "waiting" ? (
        <WaitingRoomEditor room={room} onSaved={(waiting_room) => setRoom({ ...room, waiting_room })} />
      ) : tab === "invite" ? (
        <InviteCard
          room={room}
          userId={userId}
          invites={invites}
          registrations={registrations}
          participants={state.participants}
          onInvitesChange={setInvites}
          onRegistrationsChange={setRegistrations}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
          <section className="space-y-4">
            {stage && <RoomStage connection={stage} publish onDisconnected={() => setStage(null)} />}
            <PresenterDeck
              room={room}
              presentations={presentations}
              onPresentationsChange={setPresentations}
              selected={deck}
              onSelect={(p) => void selectDeck(p)}
              page={page}
              participantsPage={live?.state === "live" ? state.lastSlide?.page_index ?? 0 : null}
              onNavigate={navigate}
            />
            {currentRunRow && currentActivity && live && <RunControls state={state} run={currentRunRow} activity={currentActivity} userId={userId} />}
            <ActivityLibrary roomId={room.id} orgId={room.org_id} activities={activities} onChange={setActivities} onActivate={live?.state === "live" ? activate : undefined} activeId={currentRunRow?.activity_id ?? null} />
          </section>

          <aside className="space-y-4">
            {live && (
              <div className="rounded-lg border p-4 dark:border-neutral-700">
                <h2 className="font-semibold">Reactions</h2>
                <div className="mt-2">
                  <ReactionBar onFlush={react} lastReaction={state.lastReaction} disabled={live.state !== "live"} />
                </div>
              </div>
            )}
            <div className="rounded-lg border p-4 dark:border-neutral-700">
              <h2 className="font-semibold">Hand raises ({state.handRaises.length})</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {state.handRaises.map((h) => {
                  const rs = state.roster[h.user_id]?.state ?? "viewer";
                  return (
                    <li key={h.id} className="flex items-center gap-2">
                      <span className="flex-1 truncate">{nameOf(h.user_id)}</span>
                      <span className="text-xs text-neutral-500">{rs}</span>
                      {rs === "viewer" || rs === "revoked" ? (
                        <button onClick={() => void stageAction("invite", h.user_id)} disabled={busy} className="text-xs text-indigo-700">promote</button>
                      ) : rs === "invited" ? (
                        <button onClick={() => void stageAction("confirm", h.user_id)} disabled={busy} className="text-xs text-green-700">confirm</button>
                      ) : (
                        <button onClick={() => void stageAction("revoke", h.user_id)} disabled={busy} className="text-xs text-red-700">revoke</button>
                      )}
                      <button onClick={() => void clearHand(h.id)} disabled={busy} className="text-xs text-neutral-500">clear</button>
                    </li>
                  );
                })}
                {state.handRaises.length === 0 && <li className="text-neutral-500">Nobody has a hand up.</li>}
              </ul>
              {Object.values(state.roster).some((r) => r.state === "live") && (
                <p className="mt-2 text-xs">
                  On stage:{" "}
                  {Object.values(state.roster).filter((r) => r.state === "live").map((r) => (
                    <button key={r.user_id} onClick={() => void stageAction("revoke", r.user_id)} className="mr-2 text-red-700">{nameOf(r.user_id)} ✕</button>
                  ))}
                </p>
              )}
            </div>
            {live && <Questions host state={state} userId={userId} onAsk={async () => undefined} onUpvote={async () => undefined} onApprove={approve} onAnswered={answered} />}
          </aside>
        </div>
      )}
    </main>
  );
}
