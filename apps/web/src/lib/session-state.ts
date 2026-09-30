/**
 * Client-side session state, built purely from the `session:{id}` broadcast
 * stream (plus an initial snapshot). Both the viewer room and the host panel
 * apply the same reducer, so what the host sees is what viewers see.
 */
import type {
  Activity,
  ActivityResponse,
  ActivityRun,
  HandRaise,
  Participant,
  Question,
  Session,
  SessionBroadcast,
  SlideEvent,
  StageRoster,
} from "@/lib/supabase/types";

export type SessionData = {
  session: Session | null;
  activities: Record<string, Activity>;
  runs: Record<string, ActivityRun>;
  votes: Record<string, Record<string, number>>; // run_id -> option_id -> count
  textAnswers: Record<string, string[]>; // run_id -> answers
  responded: Record<string, string[]>; // run_id -> user ids
  myResponses: Record<string, ActivityResponse>; // run_id -> my row
  participants: Record<string, Participant>;
  questions: Record<string, Question>;
  questionVotes: Record<string, number>;
  handRaises: HandRaise[];
  roster: Record<string, StageRoster>;
  reactions: Record<string, number>; // kind -> count in the latest bucket
  lastReaction: { kind: string; count: number; bucket_ts: string } | null;
  lastSlide: SlideEvent | null;
};

export const emptyState: SessionData = {
  session: null,
  activities: {},
  runs: {},
  votes: {},
  textAnswers: {},
  responded: {},
  myResponses: {},
  participants: {},
  questions: {},
  questionVotes: {},
  handRaises: [],
  roster: {},
  reactions: {},
  lastReaction: null,
  lastSlide: null,
};

export type Snapshot = Partial<{
  session: Session | null;
  activities: Activity[];
  runs: ActivityRun[];
  tallies: { run_id: string; option_id: string; votes: number }[];
  myResponses: ActivityResponse[];
  participants: Participant[];
  questions: Question[];
  questionVotes: { question_id: string }[];
  handRaises: HandRaise[];
  roster: StageRoster[];
  lastSlide: SlideEvent | null;
}>;

export function fromSnapshot(s: Snapshot): SessionData {
  const st: SessionData = structuredClone(emptyState);
  st.session = s.session ?? null;
  for (const a of s.activities ?? []) st.activities[a.id] = a;
  for (const r of s.runs ?? []) st.runs[r.id] = r;
  for (const t of s.tallies ?? []) (st.votes[t.run_id] ??= {})[t.option_id] = t.votes;
  for (const r of s.myResponses ?? []) st.myResponses[r.run_id] = r;
  for (const p of s.participants ?? []) st.participants[p.user_id] = p;
  for (const q of s.questions ?? []) st.questions[q.id] = q;
  for (const v of s.questionVotes ?? []) st.questionVotes[v.question_id] = (st.questionVotes[v.question_id] ?? 0) + 1;
  st.handRaises = (s.handRaises ?? []).filter((h) => !h.cleared_at);
  for (const r of s.roster ?? []) st.roster[r.user_id] = r;
  st.lastSlide = s.lastSlide ?? null;
  return st;
}

/** Apply one broadcast message. Returns a new state object only when something changed. */
export function reduce(state: SessionData, msg: SessionBroadcast, me: string | null = null): SessionData {
  const { operation, table, record, old_record } = msg.payload;
  switch (table) {
    case "sessions": {
      if (!record) return state;
      return { ...state, session: record as unknown as Session };
    }
    case "slide_events": {
      if (operation !== "INSERT" || !record) return state;
      return { ...state, lastSlide: record as unknown as SlideEvent };
    }
    case "activity_runs": {
      if (operation === "DELETE") {
        const id = (old_record as unknown as ActivityRun | null)?.id;
        if (!id || !state.runs[id]) return state;
        const runs = { ...state.runs };
        delete runs[id];
        return { ...state, runs };
      }
      const r = record as unknown as ActivityRun;
      return { ...state, runs: { ...state.runs, [r.id]: r } };
    }
    case "activity_responses": {
      if (operation !== "INSERT" || !record) return state;
      const r = record as unknown as ActivityResponse;
      const seen = state.responded[r.run_id] ?? [];
      if (seen.includes(r.user_id)) return state;
      const votes = { ...(state.votes[r.run_id] ?? {}) };
      for (const id of r.option_ids ?? []) votes[id] = (votes[id] ?? 0) + 1;
      const textAnswers = r.text_answer
        ? { ...state.textAnswers, [r.run_id]: [...(state.textAnswers[r.run_id] ?? []), r.text_answer] }
        : state.textAnswers;
      const myResponses = me && r.user_id === me ? { ...state.myResponses, [r.run_id]: r } : state.myResponses;
      return {
        ...state,
        votes: { ...state.votes, [r.run_id]: votes },
        textAnswers,
        responded: { ...state.responded, [r.run_id]: [...seen, r.user_id] },
        myResponses,
      };
    }
    case "participants": {
      const p = (record ?? old_record) as unknown as Participant;
      if (operation === "DELETE") {
        const participants = { ...state.participants };
        delete participants[p.user_id];
        return { ...state, participants };
      }
      return { ...state, participants: { ...state.participants, [p.user_id]: p } };
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
      return { ...state, reactions: { ...state.reactions, [r.kind]: r.count }, lastReaction: r };
    }
    default:
      return state;
  }
}

/** The run the overlay should show: the newest one that is not hidden. */
export function currentRun(state: SessionData): ActivityRun | null {
  let best: ActivityRun | null = null;
  for (const r of Object.values(state.runs)) {
    if (r.hidden_at) continue;
    if (!best || r.opened_at > best.opened_at) best = r;
  }
  return best;
}

export type RunPhase = "open" | "closed" | "results";

/** Where a run is in its life: answering, waiting for results, or results on screen. */
export function runPhase(run: ActivityRun, now = Date.now()): RunPhase {
  if (run.results_shown_at) return "results";
  if (run.closed_at) return "closed";
  if (run.closes_at && now > new Date(run.closes_at).getTime()) return "closed";
  return "open";
}

/** Milliseconds left on a timed run, or null when untimed. */
export function timeLeftMs(run: ActivityRun, now = Date.now()): number | null {
  if (!run.closes_at) return null;
  return Math.max(0, new Date(run.closes_at).getTime() - now);
}

export function tallyFor(state: SessionData, run: ActivityRun) {
  const activity = state.activities[run.activity_id];
  const options = activity?.options ?? [];
  const votes = state.votes[run.id] ?? {};
  const total = options.reduce((n, o) => n + (votes[o.id] ?? 0), 0);
  return {
    total,
    responses: (state.responded[run.id] ?? []).length,
    rows: options.map((o) => ({
      ...o,
      votes: votes[o.id] ?? 0,
      pct: total ? Math.round(((votes[o.id] ?? 0) / total) * 100) : 0,
    })),
  };
}

/** Word frequencies for the word cloud. */
export function wordCloud(answers: string[], limit = 40) {
  const stop = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "we", "i", "our", "for", "on", "with", "that", "this"]);
  const counts = new Map<string, number>();
  for (const a of answers) {
    for (const w of a.toLowerCase().split(/[^\p{L}\p{N}']+/u)) {
      if (w.length < 2 || stop.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}
