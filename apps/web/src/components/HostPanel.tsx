"use client";
import { useCallback, useState } from "react";
import { ConnectExtension } from "@/components/ConnectExtension";
import { CtaCard } from "@/components/CtaCard";
import { PollCard } from "@/components/PollCard";
import { Questions } from "@/components/Questions";
import { RoomStage } from "@/components/RoomStage";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { DeckSlide, Question, Room, Session } from "@/lib/supabase/types";

type Props = { room: Room; initialSession: Session | null; userId: string; slides: DeckSlide[] };

/**
 * Host panel: start/end the session, link and re-sync the deck, replay a cue,
 * moderate Q&A, and run the hand-raise queue with promote-to-stage.
 */
export function HostPanel({ room, initialSession, userId, slides: initialSlides }: Props) {
  const [session, setSession] = useState<Session | null>(initialSession);
  const [slides, setSlides] = useState(initialSlides);
  const [presentationId, setPresentationId] = useState(initialSession?.presentation_id ?? initialSlides[0]?.presentation_id ?? "");
  const [stage, setStage] = useState<{ url: string; token: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { state, status } = useSession(session?.id ?? null, { host: true });
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

  const googleToken = useCallback(async () => {
    const { data } = await sb.auth.getSession();
    const token = data.session?.provider_token;
    if (!token) throw new Error("Sign in with Google again to grant Slides access");
    return token;
  }, [sb]);

  const syncDeck = () =>
    run(async () => {
      const id = extractPresentationId(presentationId);
      if (!id) throw new Error("Paste a Google Slides URL or presentation id");
      const r = await api<{ title: string; slides: number; cues: number; errors: { index: number; error: string }[] }>("/api/deck/sync", {
        presentation_id: id,
        org_id: room.org_id,
        google_access_token: await googleToken(),
      });
      setPresentationId(id);
      const { data } = await sb.from("deck_slides").select("*").eq("presentation_id", id).order("index");
      setSlides((data as DeckSlide[]) ?? []);
      setMsg(`Synced "${r.title}": ${r.slides} slides, ${r.cues} cues${r.errors.length ? `, ${r.errors.length} cue errors` : ""}`);
    });

  const start = () =>
    run(async () => {
      const id = extractPresentationId(presentationId) || null;
      const r = await api<{ session_id: string; hls_url: string }>("/api/session/start", { room_slug: room.slug, presentation_id: id });
      const { data } = await sb.from("sessions").select("*").eq("id", r.session_id).single();
      setSession(data as Session);
      if (id) await syncDeck();
    });

  const end = () =>
    run(async () => {
      if (!session) return;
      await api("/api/session/end", { session_id: session.id });
      setSession(null);
      setStage(null);
    });

  const joinStage = () =>
    run(async () => {
      if (!session) return;
      setStage(await api<{ url: string; token: string }>("/api/token", { session_id: session.id, role: "presenter" }));
    });

  const replay = (slide: DeckSlide) => run(async () => { if (session) await api("/api/poll/replay", { session_id: session.id, slide_object_id: slide.slide_object_id }); });
  const stageAction = (action: "invite" | "confirm" | "revoke", user_id: string) =>
    run(async () => { if (session) await api("/api/stage", { action, session_id: session.id, user_id }); });
  const clearHand = (id: string) => run(async () => { await sb.from("hand_raises").update({ cleared_at: new Date().toISOString() }).eq("id", id); });
  const approve = async (q: Question, approved: boolean) => { await sb.from("questions").update({ approved }).eq("id", q.id); };
  const answered = async (q: Question) => { await sb.from("questions").update({ answered_at: new Date().toISOString() }).eq("id", q.id); };

  const activePoll = state.activePollId ? state.polls[state.activePollId] : null;
  const activeCta = state.activeCtaId ? state.ctas[state.activeCtaId] : null;
  const current = state.lastSlide;

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{room.name} · host</h1>
          <p className="text-xs text-neutral-500">
            Viewer link: <code>/r/{room.slug}</code> · {session ? `live since ${new Date(session.started_at).toLocaleTimeString()} · ${status}` : "not live"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectExtension />
          {!session && <button onClick={() => void start()} disabled={busy} className="rounded bg-green-600 px-3 py-1 text-white disabled:opacity-50">Go live</button>}
          {session && !stage && <button onClick={() => void joinStage()} disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-white disabled:opacity-50">Join as presenter</button>}
          {session && <button onClick={() => void end()} disabled={busy} className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50">End session</button>}
        </div>
      </header>
      {msg && <p className="rounded bg-neutral-100 p-2 text-sm dark:bg-neutral-800">{msg}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="space-y-4">
          {stage && <RoomStage connection={stage} publish onDisconnected={() => setStage(null)} />}

          <div className="rounded-lg border p-4 dark:border-neutral-700">
            <h2 className="font-semibold">Deck</h2>
            <div className="mt-2 flex gap-2">
              <input value={presentationId} onChange={(e) => setPresentationId(e.target.value)} placeholder="Google Slides URL or presentation id" className="flex-1 rounded border px-2 py-1 dark:bg-neutral-800" />
              <button onClick={() => void syncDeck()} disabled={busy} className="rounded border px-3 py-1 disabled:opacity-50">Sync cues</button>
            </div>
            <ol className="mt-3 max-h-80 space-y-1 overflow-auto text-sm">
              {slides.map((s) => {
                const isCurrent = current?.slide_object_id === s.slide_object_id;
                const cue = s.poll_payload ? `${s.poll_payload.kind}: ${s.poll_payload.question}` : null;
                const cta = s.cta_payload ? `cta: ${s.cta_payload.label}` : null;
                return (
                  <li key={s.id} className={`flex items-center gap-2 rounded px-2 py-1 ${isCurrent ? "bg-indigo-50 dark:bg-indigo-950" : ""}`}>
                    <span className="w-6 tabular-nums text-neutral-500">{s.index + 1}</span>
                    <span className="flex-1 truncate">{cue ?? cta ?? <span className="text-neutral-400">no cue</span>}{cue && cta ? ` · ${cta}` : ""}</span>
                    {(cue || cta) && session && (
                      <button onClick={() => void replay(s)} disabled={busy} className="text-xs text-indigo-700 disabled:opacity-50">replay</button>
                    )}
                  </li>
                );
              })}
              {slides.length === 0 && <li className="text-neutral-500">No deck synced. Type cues like <code>#poll: Q? | A | B</code> into speaker notes, then sync.</li>}
            </ol>
          </div>

          <div className="rounded-lg border p-4 dark:border-neutral-700">
            <h2 className="font-semibold">Hand raises ({state.handRaises.length})</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {state.handRaises.map((h) => {
                const rs = state.roster[h.user_id]?.state ?? "viewer";
                return (
                  <li key={h.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate font-mono text-xs">{h.user_id.slice(0, 8)}</span>
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
                On stage: {Object.values(state.roster).filter((r) => r.state === "live").map((r) => (
                  <button key={r.user_id} onClick={() => void stageAction("revoke", r.user_id)} className="mr-2 font-mono text-red-700">{r.user_id.slice(0, 8)} ✕</button>
                ))}
              </p>
            )}
          </div>
        </section>

        <aside className="space-y-3">
          {activePoll && session && <PollCard poll={activePoll} state={state} userId={userId} readOnly onVote={async () => undefined} onText={async () => undefined} />}
          {activeCta && session && <CtaCard cta={activeCta} sessionId={session.id} roomSlug={room.slug} slideId={current?.slide_object_id ?? null} readOnly />}
          {session && <Questions host state={state} userId={userId} onAsk={async () => undefined} onUpvote={async () => undefined} onApprove={approve} onAnswered={answered} />}
        </aside>
      </div>
    </main>
  );
}

/** Accepts a bare id or any docs.google.com/presentation/d/<id>/… URL. */
export function extractPresentationId(input: string): string {
  const s = input.trim();
  const m = /\/presentation\/d\/([A-Za-z0-9_-]+)/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : "";
}
