"use client";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { tallyFor, wordCloud, type SessionData } from "@/lib/session-state";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Activity, ActivityRun, QuizScore } from "@/lib/supabase/types";

type Props = { state: SessionData; run: ActivityRun; activity: Activity; userId: string | null; dark?: boolean };

/** Results for one run: bars for polls, bars + correct marks + leaderboard for quizzes, a cloud for word clouds. */
export function ResultsView({ state, run, activity, userId, dark }: Props) {
  const muted = dark ? "text-slate-400" : "text-ink-muted";
  if (activity.kind === "wordcloud") {
    const words = wordCloud(state.textAnswers[run.id] ?? []);
    return (
      <div className="mt-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {words.length === 0 && <span className={cx("text-sm", muted)}>No answers yet.</span>}
          {words.map((w, i) => (
            <span key={w.word} style={{ fontSize: `${Math.min(2.6, 0.9 + w.count * 0.3)}rem`, opacity: 1 - Math.min(0.5, i * 0.012) }} className="font-medium leading-none">
              {w.word}
            </span>
          ))}
        </div>
        <p className={cx("mt-3 text-xs", muted)}>{(state.responded[run.id] ?? []).length} answers</p>
      </div>
    );
  }
  if (activity.kind === "cta") {
    return <p className={cx("mt-3 text-sm", muted)}>{(state.responded[run.id] ?? []).length} interactions</p>;
  }
  const t = tallyFor(state, run);
  const mine = state.myResponses[run.id];
  return (
    <div className="mt-4">
      <ul className="space-y-3">
        {t.rows.map((o) => {
          const picked = mine?.option_ids.includes(o.id);
          const correct = activity.kind === "quiz" && o.correct;
          return (
            <li key={o.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={cx("min-w-0 truncate", correct && "font-medium")}>
                  {correct && <span className="mr-1 text-emerald-500">✓</span>}
                  {o.label}
                  {picked && <span className={cx("ml-1.5 text-xs", muted)}>(you)</span>}
                </span>
                <span className={cx("shrink-0 tabular-nums", muted)}>
                  <span className={dark ? "font-medium text-white" : "font-medium text-ink"}>{o.pct}%</span> · {o.votes}
                </span>
              </div>
              <div className={cx("mt-1.5 h-2 overflow-hidden rounded-full", dark ? "bg-white/15" : "bg-surface-inset")}>
                <div className={cx("h-2 rounded-full transition-all", correct ? "bg-emerald-500" : "bg-brand")} style={{ width: `${o.pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className={cx("mt-3 text-xs", muted)}>{t.total} {t.total === 1 ? "answer" : "answers"}</p>
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
  const muted = dark ? "text-slate-400" : "text-ink-muted";
  return (
    <div className={cx("mt-4 border-t pt-4", dark ? "border-white/15" : "border-line")}>
      <p className={cx("text-xs font-semibold uppercase tracking-wider", muted)}>Leaderboard</p>
      <ol className="mt-2 space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <li key={r.user_id} className={cx("flex items-center gap-3", r.user_id === userId && "font-semibold")}>
            <span className={cx("w-5 shrink-0 text-right text-xs tabular-nums", muted)}>{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{r.display_name ?? "Anonymous"}</span>
            <span className="shrink-0 tabular-nums">{r.points} pts</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
