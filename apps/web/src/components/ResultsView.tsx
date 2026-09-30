"use client";
import { useEffect, useState } from "react";
import { tallyFor, wordCloud, type SessionData } from "@/lib/session-state";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Activity, ActivityRun, QuizScore } from "@/lib/supabase/types";

type Props = { state: SessionData; run: ActivityRun; activity: Activity; userId: string | null; dark?: boolean };

/** Results for one run: bars for polls, bars + correct marks + leaderboard for quizzes, a cloud for word clouds. */
export function ResultsView({ state, run, activity, userId, dark }: Props) {
  const muted = dark ? "text-neutral-400" : "text-neutral-500";
  if (activity.kind === "wordcloud") {
    const words = wordCloud(state.textAnswers[run.id] ?? []);
    return (
      <div className="mt-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {words.length === 0 && <span className={`text-sm ${muted}`}>No answers yet.</span>}
          {words.map((w, i) => (
            <span key={w.word} style={{ fontSize: `${Math.min(2.6, 0.9 + w.count * 0.3)}rem`, opacity: 1 - Math.min(0.5, i * 0.012) }} className="leading-none">
              {w.word}
            </span>
          ))}
        </div>
        <p className={`mt-2 text-xs ${muted}`}>{(state.responded[run.id] ?? []).length} answers</p>
      </div>
    );
  }
  if (activity.kind === "cta") {
    return <p className={`mt-2 text-sm ${muted}`}>{(state.responded[run.id] ?? []).length} interactions</p>;
  }
  const t = tallyFor(state, run);
  const mine = state.myResponses[run.id];
  return (
    <div className="mt-3">
      <ul className="space-y-2">
        {t.rows.map((o) => {
          const picked = mine?.option_ids.includes(o.id);
          return (
            <li key={o.id}>
              <div className="flex justify-between text-sm">
                <span>
                  {activity.kind === "quiz" && (o.correct ? "✅ " : "")}
                  {o.label}
                  {picked && <span className={`ml-1 text-xs ${muted}`}>(you)</span>}
                </span>
                <span className={`tabular-nums ${muted}`}>{o.pct}% · {o.votes}</span>
              </div>
              <div className={`mt-1 h-2 rounded ${dark ? "bg-white/15" : "bg-neutral-200"}`}>
                <div className={`h-2 rounded transition-all ${activity.kind === "quiz" && o.correct ? "bg-green-500" : "bg-indigo-500"}`} style={{ width: `${o.pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className={`mt-2 text-xs ${muted}`}>{t.total} {t.total === 1 ? "answer" : "answers"}</p>
      {activity.kind === "quiz" && <Leaderboard sessionId={run.session_id} runId={run.id} userId={userId} dark={dark} />}
    </div>
  );
}

/** Top scorers across all quizzes in the session. Read from the quiz_scores view on each reveal. */
function Leaderboard({ sessionId, runId, userId, dark }: { sessionId: string; runId: string; userId: string | null; dark?: boolean }) {
  const [rows, setRows] = useState<QuizScore[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser()
        .from("quiz_scores")
        .select("*")
        .eq("session_id", sessionId)
        .order("points", { ascending: false })
        .order("total_ms")
        .limit(10);
      if (!cancelled) setRows((data as QuizScore[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, runId]);
  if (rows.length === 0) return null;
  return (
    <ol className={`mt-4 space-y-1 border-t pt-3 text-sm ${dark ? "border-white/15" : "border-neutral-200"}`}>
      <li className={`text-xs uppercase tracking-wide ${dark ? "text-neutral-400" : "text-neutral-500"}`}>Leaderboard</li>
      {rows.map((r, i) => (
        <li key={r.user_id} className={`flex justify-between ${r.user_id === userId ? "font-semibold" : ""}`}>
          <span>{i + 1}. {r.display_name ?? "Anonymous"}</span>
          <span className="tabular-nums">{r.points} pts</span>
        </li>
      ))}
    </ol>
  );
}
