"use client";
import { ResultsView } from "@/components/ResultsView";
import { Button, Card, Eyebrow, Stat, cx } from "@/components/ui";
import { useNow } from "@/hooks/useSession";
import { runPhase, timeLeftMs, type SessionData } from "@/lib/session-state";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Activity, ActivityRun } from "@/lib/supabase/types";

type Props = { state: SessionData; run: ActivityRun; activity: Activity; userId: string };

const PHASE_LABEL = { open: "Open for answers", closed: "Answers closed", results: "Showing results" } as const;

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
  const urgent = left !== null && left < 5000;

  return (
    <Card className="border-indigo-300 dark:border-indigo-800">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>
            {activity.kind} · {PHASE_LABEL[phase as keyof typeof PHASE_LABEL] ?? phase}
          </Eyebrow>
          <h3 className="mt-1 truncate text-base font-semibold text-ink">{activity.title}</h3>
        </div>
        <Stat value={answered} label="answered" className="shrink-0 text-right" />
      </div>
      {phase === "open" && left !== null && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-surface-inset">
            <div className={cx("h-2 rounded-full transition-all", urgent ? "bg-red-500" : "bg-brand")} style={{ width: `${(left / ((activity.timer_seconds ?? 1) * 1000)) * 100}%` }} />
          </div>
          <p className={cx("mt-1.5 text-xs tabular-nums", urgent ? "font-medium text-red-600 dark:text-red-400" : "text-ink-muted")}>{Math.ceil(left / 1000)}s left</p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {phase === "open" && activity.kind !== "cta" && (
          <Button variant="secondary" size="sm" onClick={() => void patch({ closed_at: ts() })}>
            Close answers
          </Button>
        )}
        {phase !== "results" && activity.kind !== "cta" && (
          <Button size="sm" onClick={() => void patch({ closed_at: run.closed_at ?? ts(), results_shown_at: ts() })}>
            Show results to participants
          </Button>
        )}
        {phase === "results" && (
          <Button variant="secondary" size="sm" onClick={() => void patch({ results_shown_at: null })}>
            Hide results
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => void patch({ hidden_at: ts(), closed_at: run.closed_at ?? ts() })}>
          Dismiss overlay
        </Button>
      </div>
      <ResultsView state={state} run={run} activity={activity} userId={userId} />
    </Card>
  );
}
