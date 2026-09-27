"use client";
import { useState } from "react";
import { tallyFor, wordCloud, type SessionState } from "@/lib/session-state";
import type { Poll } from "@/lib/supabase/types";

type Props = {
  poll: Poll;
  state: SessionState;
  userId: string | null;
  onVote: (optionIds: string[]) => Promise<void>;
  onText: (answer: string) => Promise<void>;
  /** Host view: results only, no answer controls. */
  readOnly?: boolean;
};

export function PollCard({ poll, state, userId, onVote, onText, readOnly }: Props) {
  const answered = !!userId && (state.responded[poll.id] ?? []).includes(userId);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [localDone, setLocalDone] = useState(false);
  const done = readOnly || answered || localDone;

  const submit = async () => {
    setBusy(true);
    try {
      if (poll.kind === "text") await onText(text.trim());
      else await onVote(picked);
      setLocalDone(true);
    } finally {
      setBusy(false);
    }
  };

  if (poll.kind === "text") {
    const cloud = wordCloud(state.textAnswers[poll.id] ?? []);
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
        <h3 className="font-semibold">{poll.question}</h3>
        {!done && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) void submit();
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={120} placeholder="Your answer" className="flex-1 rounded border px-2 py-1 dark:bg-neutral-800" />
            <button disabled={busy || !text.trim()} className="rounded bg-indigo-600 px-3 py-1 text-white disabled:opacity-50">Send</button>
          </form>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {cloud.length === 0 && <span className="text-sm text-neutral-500">Waiting for answers…</span>}
          {cloud.map((w) => (
            <span key={w.word} style={{ fontSize: `${Math.min(2.2, 0.85 + w.count * 0.25)}rem` }} className="leading-none">
              {w.word}
            </span>
          ))}
        </div>
      </section>
    );
  }

  const tally = tallyFor(state, poll.id);
  const multi = poll.kind === "multipoll";
  const toggle = (id: string) => setPicked((p) => (multi ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]));

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="font-semibold">{poll.question}</h3>
      <ul className="mt-3 space-y-2">
        {tally.rows.map((o) => (
          <li key={o.id}>
            {done ? (
              <div>
                <div className="flex justify-between text-sm">
                  <span>{o.label}</span>
                  <span className="tabular-nums text-neutral-500">{o.pct}% · {o.votes}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-neutral-200 dark:bg-neutral-700">
                  <div className="h-2 rounded bg-indigo-500 transition-all" style={{ width: `${o.pct}%` }} />
                </div>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded border px-2 py-1 hover:bg-neutral-50 dark:hover:bg-neutral-800">
                <input type={multi ? "checkbox" : "radio"} name={poll.id} checked={picked.includes(o.id)} onChange={() => toggle(o.id)} />
                {o.label}
              </label>
            )}
          </li>
        ))}
      </ul>
      {!done && (
        <button onClick={() => void submit()} disabled={busy || picked.length === 0} className="mt-3 rounded bg-indigo-600 px-3 py-1 text-white disabled:opacity-50">
          Vote
        </button>
      )}
      <p className="mt-2 text-xs text-neutral-500">{tally.total} {tally.total === 1 ? "response" : "responses"}</p>
    </section>
  );
}
