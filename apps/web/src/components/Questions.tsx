"use client";
import { useState } from "react";
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
};

export function Questions({ state, userId, onAsk, onUpvote, onApprove, onAnswered, host }: Props) {
  const [body, setBody] = useState("");
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const list = Object.values(state.questions)
    .filter((q) => host || q.approved || q.user_id === userId)
    .sort((a, b) => (state.questionVotes[b.id] ?? 0) - (state.questionVotes[a.id] ?? 0) || a.created_at.localeCompare(b.created_at));

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="font-semibold">Q&amp;A</h3>
      {!host && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            void onAsk(body.trim()).then(() => setBody(""));
          }}
        >
          <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} placeholder="Ask a question" className="flex-1 rounded border px-2 py-1 dark:bg-neutral-800" />
          <button className="rounded bg-neutral-800 px-3 py-1 text-white dark:bg-neutral-200 dark:text-neutral-900">Ask</button>
        </form>
      )}
      <ul className="mt-3 space-y-2">
        {list.length === 0 && <li className="text-sm text-neutral-500">No questions yet.</li>}
        {list.map((q) => (
          <li key={q.id} className={`flex items-start gap-2 rounded border px-2 py-1 ${q.answered_at ? "opacity-50" : ""} ${!q.approved ? "border-dashed" : ""}`}>
            <button
              disabled={voted.has(q.id)}
              onClick={() => void onUpvote(q.id).then(() => setVoted((s) => new Set(s).add(q.id)))}
              className="rounded bg-neutral-100 px-2 text-sm tabular-nums disabled:opacity-60 dark:bg-neutral-800"
              title="Upvote"
            >
              ▲ {state.questionVotes[q.id] ?? 0}
            </button>
            <span className="flex-1 text-sm">{q.body}</span>
            {host && onApprove && !q.approved && (
              <button onClick={() => void onApprove(q, true)} className="text-xs text-green-700">approve</button>
            )}
            {host && onApprove && q.approved && !q.answered_at && (
              <button onClick={() => void onApprove(q, false)} className="text-xs text-neutral-500">hide</button>
            )}
            {host && onAnswered && !q.answered_at && (
              <button onClick={() => void onAnswered(q)} className="text-xs text-indigo-700">answered</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
