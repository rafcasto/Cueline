"use client";
import { useState } from "react";
import { ResultsView } from "@/components/ResultsView";
import { Alert, Badge, Button, Card, Eyebrow, Stat, cx } from "@/components/ui";
import { useNow } from "@/hooks/useSession";
import { runPhase, timeLeftMs, type SessionData } from "@/lib/session-state";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Activity, ActivityRun } from "@/lib/supabase/types";

type Props = { state: SessionData; run: ActivityRun; activity: Activity; userId: string };

const PHASE_LABEL = { open: "Open for answers", closed: "Answers closed", results: "Showing results" } as const;
const KIND_LABEL = { poll: "Poll", quiz: "Quiz", wordcloud: "Word cloud", cta: "Call to action" } as const;

/**
 * Presenter controls for the latest run: live count and countdown while open, close early,
 * "Show results" to present them, and show/hide the overlay at any time. Hiding keeps the
 * run (and its answers) so it can come back; activating again from the library starts afresh.
 */
export function RunControls({ state, run, activity, userId }: Props) {
  const now = useNow();
  const phase = runPhase(run, now);
  const left = timeLeftMs(run, now);
  const hidden = !!run.hidden_at;
  const answered = (state.responded[run.id] ?? []).length;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ts = () => new Date().toISOString();
  const urgent = left !== null && left < 5000;
  const isCta = activity.kind === "cta";

  // The query builder only runs when awaited; never fire-and-forget a Supabase call.
  const patch = async (p: Partial<ActivityRun>) => {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().from("activity_runs").update(p).eq("id", run.id);
    if (error) setError(error.message);
    setBusy(false);
  };

  const statusLabel = isCta ? (hidden ? "Hidden" : "On screen") : PHASE_LABEL[phase];

  return (
    <Card className={cx(hidden ? "border-line" : "border-indigo-300 dark:border-indigo-800")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>
            {KIND_LABEL[activity.kind]} · {statusLabel}
          </Eyebrow>
          <h3 className="mt-1 truncate text-base font-semibold text-ink">{activity.title}</h3>
          {hidden && !isCta && (
            <Badge tone="neutral" className="mt-2">
              Hidden from participants
            </Badge>
          )}
        </div>
        {!isCta && <Stat value={answered} label="answered" className="shrink-0 text-right" />}
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
        {phase === "open" && !isCta && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void patch({ closed_at: ts() })}>
            Close answers
          </Button>
        )}
        {phase !== "results" && !isCta && (
          <Button size="sm" disabled={busy} onClick={() => void patch({ closed_at: run.closed_at ?? ts(), results_shown_at: ts(), hidden_at: null })}>
            Show results to participants
          </Button>
        )}
        {phase === "results" && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void patch({ results_shown_at: null })}>
            Hide results
          </Button>
        )}
        {hidden ? (
          <Button variant={isCta ? "primary" : "secondary"} size="sm" disabled={busy} onClick={() => void patch({ hidden_at: null })}>
            Show to participants
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void patch({ hidden_at: ts() })}>
            Hide from participants
          </Button>
        )}
      </div>
      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
      {!isCta && <ResultsView state={state} run={run} activity={activity} userId={userId} />}
    </Card>
  );
}
