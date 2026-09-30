"use client";
import { ResultsView } from "@/components/ResultsView";
import { useNow } from "@/hooks/useSession";
import { runPhase, timeLeftMs, type SessionData } from "@/lib/session-state";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Activity, ActivityRun } from "@/lib/supabase/types";

type Props = { state: SessionData; run: ActivityRun; activity: Activity; userId: string };

/**
 * Presenter controls for the current run: live count and countdown while open,
 * close early, then "Show results" to present them to participants, then hide.
 */
export function RunControls({ state, run, activity, userId }: Props) {
  const now = useNow();
  const phase = runPhase(run, now);
  const left = timeLeftMs(run, now);
  const answered = (state.responded[run.id] ?? []).length;
  const sb = supabaseBrowser();
  const patch = (p: Partial<ActivityRun>) => sb.from("activity_runs").update(p).eq("id", run.id);
  const ts = () => new Date().toISOString();

  return (
    <div className="rounded-lg border border-indigo-300 p-4 dark:border-indigo-800">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500">{activity.kind} · {phase}</div>
          <h3 className="font-semibold">{activity.title}</h3>
        </div>
        <div className="text-right text-sm">
          <div className="text-2xl font-semibold tabular-nums">{answered}</div>
          <div className="text-xs text-neutral-500">answered</div>
        </div>
      </div>
      {phase === "open" && left !== null && (
        <div className="mt-2">
          <div className="h-2 rounded bg-neutral-200 dark:bg-neutral-700">
            <div className="h-2 rounded bg-indigo-500 transition-all" style={{ width: `${(left / ((activity.timer_seconds ?? 1) * 1000)) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs tabular-nums text-neutral-500">{Math.ceil(left / 1000)}s left</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {phase === "open" && activity.kind !== "cta" && (
          <button onClick={() => void patch({ closed_at: ts() })} className="rounded bg-amber-500 px-3 py-1 text-sm text-white">Close answers</button>
        )}
        {phase !== "results" && activity.kind !== "cta" && (
          <button onClick={() => void patch({ closed_at: run.closed_at ?? ts(), results_shown_at: ts() })} className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">
            Show results to participants
          </button>
        )}
        {phase === "results" && (
          <button onClick={() => void patch({ results_shown_at: null })} className="rounded border px-3 py-1 text-sm">Hide results</button>
        )}
        <button onClick={() => void patch({ hidden_at: ts(), closed_at: run.closed_at ?? ts() })} className="rounded border px-3 py-1 text-sm">Dismiss overlay</button>
      </div>
      <ResultsView state={state} run={run} activity={activity} userId={userId} />
    </div>
  );
}
