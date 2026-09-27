/**
 * Client-side session state, built purely from the `session:{id}` broadcast
 * stream (plus an initial snapshot). Both the viewer room and the host panel
 * apply the same reducer, so what the host sees is what viewers see.
 */
import type { Cta, HandRaise, Poll, PollOption, Question, SessionBroadcast, SlideEvent, StageRoster } from "@/lib/supabase/types";

export type PollResponseRecord = { id: string; poll_id: string; user_id: string; option_ids: string[]; text_answer: string | null };

export type SessionState = {
  polls: Record<string, Poll>;
  options: Record<string, PollOption[]>; // by poll_id, sorted by index
  votes: Record<string, Record<string, number>>; // poll_id -> option_id -> count
  textAnswers: Record<string, string[]>; // poll_id -> answers
  responded: Record<string, string[]>; // poll_id -> user ids (for dedupe)
  ctas: Record<string, Cta>;
  questions: Record<string, Question>;
  questionVotes: Record<string, number>;
  handRaises: HandRaise[];
  roster: Record<string, StageRoster>; // by user_id
  reactions: Record<string, number>; // kind -> count in the last bucket
  lastSlide: SlideEvent | null;
  /** Latest slide event carrying a poll or CTA; what the panel should show. */
  activePollId: string | null;
  activeCtaId: string | null;
};

export const emptyState: SessionState = {
  polls: {},
  options: {},
  votes: {},
  textAnswers: {},
  responded: {},
  ctas: {},
  questions: {},
  questionVotes: {},
  handRaises: [],
  roster: {},
  reactions: {},
  lastSlide: null,
  activePollId: null,
  activeCtaId: null,
};

export type Snapshot = Partial<{
  polls: Poll[];
  options: PollOption[];
  tallies: { poll_id: string; option_id: string; votes: number }[];
  ctas: Cta[];
  questions: Question[];
  questionVotes: { question_id: string }[];
  handRaises: HandRaise[];
  roster: StageRoster[];
  lastSlide: SlideEvent | null;
}>;

export function fromSnapshot(s: Snapshot): SessionState {
  const st: SessionState = structuredClone(emptyState);
  for (const p of s.polls ?? []) st.polls[p.id] = p;
  for (const o of s.options ?? []) (st.options[o.poll_id] ??= []).push(o);
  for (const list of Object.values(st.options)) list.sort((a, b) => a.index - b.index);
  for (const t of s.tallies ?? []) (st.votes[t.poll_id] ??= {})[t.option_id] = t.votes;
  for (const c of s.ctas ?? []) st.ctas[c.id] = c;
  for (const q of s.questions ?? []) st.questions[q.id] = q;
  for (const v of s.questionVotes ?? []) st.questionVotes[v.question_id] = (st.questionVotes[v.question_id] ?? 0) + 1;
  st.handRaises = (s.handRaises ?? []).filter((h) => !h.cleared_at);
  for (const r of s.roster ?? []) st.roster[r.user_id] = r;
  if (s.lastSlide) {
    st.lastSlide = s.lastSlide;
    st.activePollId = s.lastSlide.poll_id;
    st.activeCtaId = s.lastSlide.cta_id;
  }
  return st;
}

/** Apply one broadcast message. Returns a new state object only when something changed. */
export function reduce(state: SessionState, msg: SessionBroadcast): SessionState {
  const { operation, table, record, old_record } = msg.payload;
  switch (table) {
    case "slide_events": {
      if (operation !== "INSERT" || !record) return state;
      const ev = record as unknown as SlideEvent;
      return {
        ...state,
        lastSlide: ev,
        // A slide with no cue clears the panel; a cue slide replaces it.
        activePollId: ev.poll_id,
        activeCtaId: ev.cta_id,
      };
    }
    case "polls": {
      if (operation === "DELETE") {
        const id = (old_record as unknown as Poll | null)?.id;
        if (!id || !state.polls[id]) return state;
        const polls = { ...state.polls };
        delete polls[id];
        return { ...state, polls, activePollId: state.activePollId === id ? null : state.activePollId };
      }
      const p = record as unknown as Poll;
      return { ...state, polls: { ...state.polls, [p.id]: p } };
    }
    case "poll_options": {
      if (operation !== "INSERT" || !record) return state;
      const o = record as unknown as PollOption;
      const list = [...(state.options[o.poll_id] ?? []).filter((x) => x.id !== o.id), o].sort((a, b) => a.index - b.index);
      return { ...state, options: { ...state.options, [o.poll_id]: list } };
    }
    case "poll_responses": {
      if (operation !== "INSERT" || !record) return state;
      const r = record as unknown as PollResponseRecord;
      const seen = state.responded[r.poll_id] ?? [];
      if (seen.includes(r.user_id)) return state; // unique (poll_id, user_id) server-side; belt and braces here
      const votes = { ...(state.votes[r.poll_id] ?? {}) };
      for (const id of r.option_ids ?? []) votes[id] = (votes[id] ?? 0) + 1;
      const textAnswers = r.text_answer
        ? { ...state.textAnswers, [r.poll_id]: [...(state.textAnswers[r.poll_id] ?? []), r.text_answer] }
        : state.textAnswers;
      return {
        ...state,
        votes: { ...state.votes, [r.poll_id]: votes },
        textAnswers,
        responded: { ...state.responded, [r.poll_id]: [...seen, r.user_id] },
      };
    }
    case "ctas": {
      if (operation !== "INSERT" && operation !== "UPDATE") return state;
      const c = record as unknown as Cta;
      return { ...state, ctas: { ...state.ctas, [c.id]: c } };
    }
    case "questions": {
      if (operation === "DELETE") {
        const id = (old_record as unknown as Question | null)?.id;
        if (!id) return state;
        const questions = { ...state.questions };
        delete questions[id];
        return { ...state, questions };
      }
      const q = record as unknown as Question;
      return { ...state, questions: { ...state.questions, [q.id]: q } };
    }
    case "question_votes": {
      if (operation !== "INSERT" || !record) return state;
      const id = (record as { question_id: string }).question_id;
      return { ...state, questionVotes: { ...state.questionVotes, [id]: (state.questionVotes[id] ?? 0) + 1 } };
    }
    case "hand_raises": {
      const h = (record ?? old_record) as unknown as HandRaise;
      const rest = state.handRaises.filter((x) => x.id !== h.id);
      const open = operation !== "DELETE" && !h.cleared_at;
      return { ...state, handRaises: open ? [...rest, h].sort((a, b) => a.raised_at.localeCompare(b.raised_at)) : rest };
    }
    case "stage_roster": {
      const r = (record ?? old_record) as unknown as StageRoster;
      if (operation === "DELETE") {
        const roster = { ...state.roster };
        delete roster[r.user_id];
        return { ...state, roster };
      }
      return { ...state, roster: { ...state.roster, [r.user_id]: r } };
    }
    case "reactions": {
      if (!record) return state;
      const r = record as { kind: string; count: number; bucket_ts: string };
      // Newest bucket wins; the UI animates the delta.
      return { ...state, reactions: { ...state.reactions, [r.kind]: r.count } };
    }
    default:
      return state;
  }
}

export function tallyFor(state: SessionState, pollId: string) {
  const options = state.options[pollId] ?? [];
  const votes = state.votes[pollId] ?? {};
  const total = options.reduce((n, o) => n + (votes[o.id] ?? 0), 0);
  return {
    total,
    rows: options.map((o) => ({ ...o, votes: votes[o.id] ?? 0, pct: total ? Math.round(((votes[o.id] ?? 0) / total) * 100) : 0 })),
  };
}

/** Word frequencies for the open-text word cloud. */
export function wordCloud(answers: string[], limit = 30) {
  const stop = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "we", "i", "our", "for", "on", "with", "that", "this"]);
  const counts = new Map<string, number>();
  for (const a of answers) {
    for (const w of a.toLowerCase().split(/[^a-z0-9']+/)) {
      if (w.length < 2 || stop.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}
