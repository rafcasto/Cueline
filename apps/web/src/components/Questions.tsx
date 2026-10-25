"use client";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Input, cx } from "@/components/ui";
import type { SessionData } from "@/lib/session-state";
import type { Question } from "@/lib/supabase/types";

type Props = {
  state: SessionData;
  userId: string | null;
  onAsk: (body: string) => Promise<void>;
  onUpvote: (id: string) => Promise<void>;
  /** Host moderation controls. */
  onApprove?: (q: Question, approved: boolean) => Promise<void>;
  onAnswered?: (q: Question) => Promise<void>;
  host?: boolean;
  /** No card chrome, for a tab panel that already has it. */
  bare?: boolean;
};

export function Questions({ state, userId, onAsk, onUpvote, onApprove, onAnswered, host, bare }: Props) {
  const [body, setBody] = useState("");
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const list = Object.values(state.questions)
    .filter((q) => host || q.approved || q.user_id === userId)
    .sort((a, b) => (state.questionVotes[b.id] ?? 0) - (state.questionVotes[a.id] ?? 0) || a.created_at.localeCompare(b.created_at));

  const inner = (
    <>
      {!host && (
        <form
          className={cx("flex gap-2", !bare && "mt-4")}
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            void onAsk(body.trim()).then(() => setBody(""));
          }}
        >
          <Input value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} placeholder="Ask a question" aria-label="Your question" />
          <Button type="submit" size="md" className="shrink-0">
            Ask
          </Button>
        </form>
      )}
      <ul className="mt-4 space-y-2">
        {list.length === 0 && <li className="py-4 text-center text-sm text-ink-muted">No questions yet.</li>}
        {list.map((q) => (
          <li
            key={q.id}
            className={cx(
              "flex items-start gap-3 rounded-lg border px-3 py-2.5",
              q.approved ? "border-line bg-surface-raised" : "border-dashed border-line-strong",
              q.answered_at && "opacity-60",
            )}
          >
            <button
              type="button"
              disabled={voted.has(q.id)}
              onClick={() => void onUpvote(q.id).then(() => setVoted((s) => new Set(s).add(q.id)))}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line-strong bg-surface-raised px-2.5 text-xs font-medium tabular-nums text-ink shadow-card transition-colors hover:bg-surface-inset disabled:pointer-events-none disabled:opacity-60"
              title="Upvote"
            >
              ▲ {state.questionVotes[q.id] ?? 0}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed text-ink">{q.body}</p>
              {host && !q.approved && (
                <Badge tone="warning" className="mt-1">
                  pending
                </Badge>
              )}
            </div>
            {host && (
              <div className="flex shrink-0 items-center gap-1">
                {onApprove && !q.approved && (
                  <Button variant="ghost" size="sm" className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400" onClick={() => void onApprove(q, true)}>
                    Approve
                  </Button>
                )}
                {onApprove && q.approved && !q.answered_at && (
                  <Button variant="ghost" size="sm" onClick={() => void onApprove(q, false)}>
                    Hide
                  </Button>
                )}
                {onAnswered && !q.answered_at && (
                  <Button variant="ghost" size="sm" className="text-brand hover:text-brand-hover" onClick={() => void onAnswered(q)}>
                    Answered
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
  if (bare) return <div>{inner}</div>;
  return (
    <Card>
      <CardHeader title="Q&A" description={host ? "Approve questions to show them to everyone." : undefined} />
      {inner}
    </Card>
  );
}
