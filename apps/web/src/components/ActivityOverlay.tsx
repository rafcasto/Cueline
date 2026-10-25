"use client";
import { useEffect, useRef, useState } from "react";
import { ResultsView } from "@/components/ResultsView";
import { cx } from "@/components/ui";
import { useNow } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { runPhase, timeLeftMs, type SessionData } from "@/lib/session-state";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Activity, ActivityRun } from "@/lib/supabase/types";
import { StripeCheckout } from "@/components/StripeCheckout";

type Props = {
  state: SessionData;
  run: ActivityRun;
  activity: Activity;
  userId: string | null;
  roomSlug: string;
  /** Host preview: no answer controls. */
  readOnly?: boolean;
};

/**
 * The participant overlay: answer while the run is open, wait when it closes,
 * see results when the presenter shows them. Sits over the slide.
 */
export function ActivityOverlay({ state, run, activity, userId, roomSlug, readOnly }: Props) {
  const now = useNow();
  const phase = runPhase(run, now);
  const left = timeLeftMs(run, now);
  const mine = state.myResponses[run.id];

  return (
    <div className="pointer-events-auto w-full max-w-lg animate-rise rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-white shadow-overlay backdrop-blur">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
        <span>{label(activity.kind)}</span>
        {left !== null && phase === "open" && <span className={cx("tabular-nums", left < 5000 && "text-red-400")}>{Math.ceil(left / 1000)}s</span>}
        {phase === "closed" && <span>Time&apos;s up</span>}
        {phase === "results" && <span>Results</span>}
      </div>
      <h3 className="mt-2 text-lg font-semibold leading-snug">{activity.title}</h3>

      {phase === "results" ? (
        <ResultsView state={state} run={run} activity={activity} userId={userId} dark />
      ) : activity.kind === "cta" ? (
        <CtaBody run={run} activity={activity} roomSlug={roomSlug} pageIndex={state.lastSlide?.page_index ?? null} readOnly={readOnly} />
      ) : phase === "closed" ? (
        <p className="mt-4 text-sm leading-relaxed text-slate-300">
          {mine ? "Answer received. Waiting for the presenter to reveal the results." : "Answers are closed. Waiting for the results."}
        </p>
      ) : mine || readOnly ? (
        <p className="mt-4 text-sm leading-relaxed text-slate-300">
          {readOnly ? `${(state.responded[run.id] ?? []).length} answered so far.` : "Answer received."}
        </p>
      ) : (
        <AnswerForm run={run} activity={activity} userId={userId} />
      )}
    </div>
  );
}

function label(kind: Activity["kind"]) {
  return { poll: "Poll", quiz: "Quiz", wordcloud: "Word cloud", cta: "Call to action" }[kind];
}

const overlayPrimary =
  "inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-white px-4 font-semibold text-slate-900 transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-50";

function AnswerForm({ run, activity, userId }: { run: ActivityRun; activity: Activity; userId: string | null }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const multi = activity.kind === "poll" && activity.options.length > 0 && activity.config.max_words === undefined && false;
  const toggle = (id: string) => setPicked((p) => (multi ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]));

  const submit = async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    const row =
      activity.kind === "wordcloud"
        ? { run_id: run.id, session_id: run.session_id, user_id: userId, text_answer: text.trim() }
        : { run_id: run.id, session_id: run.session_id, user_id: userId, option_ids: picked };
    const { error } = await supabaseBrowser().from("activity_responses").insert(row);
    if (error) {
      const m = error.message;
      setError(m.includes("time is up") || m.includes("closed") ? "Too late, answers are closed." : m.includes("duplicate") ? "You have already answered." : m);
    }
    setBusy(false);
  };

  if (activity.kind === "wordcloud") {
    return (
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void submit();
        }}
      >
        <div className="flex gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={80}
            placeholder="One or two words"
            className="h-11 flex-1 rounded-lg border border-white/10 bg-white/10 px-3 text-white placeholder:text-slate-400 focus:border-white/30 focus-visible:outline-none focus:ring-2 focus:ring-white/20"
          />
          <button type="submit" disabled={busy || !text.trim()} className={cx(overlayPrimary, "w-auto px-5")}>
            Send
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </form>
    );
  }

  return (
    <div className="mt-4">
      <ul className="space-y-2">
        {activity.options.map((o) => {
          const on = picked.includes(o.id);
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => toggle(o.id)}
                aria-pressed={on}
                className={cx("w-full cursor-pointer rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors", on ? "bg-brand text-white" : "bg-white/10 hover:bg-white/15")}
              >
                {o.label}
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => void submit()} disabled={busy || picked.length === 0} className={cx(overlayPrimary, "mt-4")}>
        {activity.kind === "quiz" ? "Lock in" : "Vote"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

/** Logs a view when shown and a tap before any checkout loads, so abandonment is captured. */
function CtaBody({ run, activity, roomSlug, pageIndex, readOnly }: { run: ActivityRun; activity: Activity; roomSlug: string; pageIndex: number | null; readOnly?: boolean }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [embed, setEmbed] = useState(false);
  const [busy, setBusy] = useState(false);
  const viewed = useRef<string | null>(null);
  const dest = activity.config.destination ?? "tab";
  const target = activity.config.target ?? "";

  useEffect(() => {
    if (readOnly || viewed.current === run.id) return;
    viewed.current = run.id;
    void api("/api/cta/event", { run_id: run.id, session_id: run.session_id, page_index: pageIndex, action: "view" }).catch(() => undefined);
  }, [run.id, run.session_id, pageIndex, readOnly]);

  const tap = async () => {
    setBusy(true);
    try {
      const { cta_event_id } = await api<{ cta_event_id: string }>("/api/cta/event", { run_id: run.id, session_id: run.session_id, page_index: pageIndex, action: "tap" });
      if (dest === "stripe") {
        const r = await api<{ client_secret: string }>("/api/cta/checkout", { run_id: run.id, cta_event_id, room_slug: roomSlug });
        setClientSecret(r.client_secret);
      } else if (dest === "embed") setEmbed(true);
      else window.open(target, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  };

  if (readOnly) return <p className="mt-2 text-xs text-slate-400">{dest} · {target}</p>;
  if (clientSecret) return <div className="mt-4 overflow-hidden rounded-lg bg-white"><StripeCheckout clientSecret={clientSecret} /></div>;
  if (embed) return <EmbedFrame url={target} onBlocked={() => { setEmbed(false); window.open(target, "_blank", "noopener"); }} />;
  return (
    <button
      type="button"
      onClick={() => void tap()}
      disabled={busy}
      className="mt-4 inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-amber-400 px-4 font-semibold text-slate-900 transition-colors hover:bg-amber-300 disabled:pointer-events-none disabled:opacity-50"
    >
      {dest === "stripe" ? "Buy now" : "Open"}
    </button>
  );
}

/** Most SaaS signup pages send X-Frame-Options: DENY; give the frame a few seconds, then fall back to a tab. */
function EmbedFrame({ url, onBlocked }: { url: string; onBlocked: () => void }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!loaded) onBlocked();
    }, 4000);
    return () => clearTimeout(t);
  }, [loaded, onBlocked]);
  return <iframe src={url} onLoad={() => setLoaded(true)} className="mt-4 h-[420px] w-full rounded-lg bg-white" sandbox="allow-forms allow-scripts allow-same-origin allow-popups" />;
}
