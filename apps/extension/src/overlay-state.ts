/**
 * A trimmed copy of the web app's session reducer, producing only what the
 * overlay draws: the active poll's tallies, word cloud, CTA label and hand count.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Poll = { id: string; kind: string; question: string };
type Option = { id: string; poll_id: string; index: number; label: string };
type Msg = { payload: { operation: "INSERT" | "UPDATE" | "DELETE"; table: string; record: Record<string, unknown> | null; old_record: Record<string, unknown> | null } };

export type OverlayInternal = {
  polls: Map<string, Poll>;
  options: Map<string, Option[]>;
  votes: Map<string, Map<string, number>>;
  responded: Map<string, Set<string>>;
  text: Map<string, string[]>;
  ctas: Map<string, { label: string }>;
  hands: Set<string>;
  activePoll: string | null;
  activeCta: string | null;
  load(sb: SupabaseClient, sessionId: string): Promise<void>;
  view(): { poll: { question: string; kind: string; rows: { label: string; votes: number; pct: number }[]; total: number; words: { word: string; count: number }[] } | null; handRaises: number; cta: { label: string } | null };
};

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "we", "i", "our", "for", "on", "with", "that", "this"]);

export function emptyOverlay(): OverlayInternal {
  const s: OverlayInternal = {
    polls: new Map(),
    options: new Map(),
    votes: new Map(),
    responded: new Map(),
    text: new Map(),
    ctas: new Map(),
    hands: new Set(),
    activePoll: null,
    activeCta: null,
    async load(sb, sessionId) {
      const [polls, options, tallies, ctas, hands, last] = await Promise.all([
        sb.from("polls").select("id, kind, question").eq("session_id", sessionId),
        sb.from("poll_options").select("id, poll_id, index, label").eq("session_id", sessionId),
        sb.from("poll_tallies").select("poll_id, option_id, votes").eq("session_id", sessionId),
        sb.from("ctas").select("id, label").eq("session_id", sessionId),
        sb.from("hand_raises").select("id").eq("session_id", sessionId).is("cleared_at", null),
        sb.from("slide_events").select("poll_id, cta_id").eq("session_id", sessionId).order("server_ts", { ascending: false }).limit(1).maybeSingle(),
      ]);
      for (const p of polls.data ?? []) s.polls.set(p.id, p);
      for (const o of options.data ?? []) s.options.set(o.poll_id, [...(s.options.get(o.poll_id) ?? []), o].sort((a, b) => a.index - b.index));
      for (const t of tallies.data ?? []) {
        const m = s.votes.get(t.poll_id) ?? new Map<string, number>();
        m.set(t.option_id, t.votes);
        s.votes.set(t.poll_id, m);
      }
      for (const c of ctas.data ?? []) s.ctas.set(c.id, { label: c.label });
      for (const h of hands.data ?? []) s.hands.add(h.id);
      s.activePoll = (last.data?.poll_id as string | null) ?? null;
      s.activeCta = (last.data?.cta_id as string | null) ?? null;
    },
    view() {
      const p = s.activePoll ? s.polls.get(s.activePoll) : null;
      let poll = null;
      if (p) {
        const opts = s.options.get(p.id) ?? [];
        const v = s.votes.get(p.id) ?? new Map<string, number>();
        const total = p.kind === "text" ? (s.text.get(p.id) ?? []).length : opts.reduce((n, o) => n + (v.get(o.id) ?? 0), 0);
        const counts = new Map<string, number>();
        for (const a of s.text.get(p.id) ?? []) {
          for (const w of a.toLowerCase().split(/[^a-z0-9']+/)) {
            if (w.length < 2 || STOP.has(w)) continue;
            counts.set(w, (counts.get(w) ?? 0) + 1);
          }
        }
        poll = {
          question: p.question,
          kind: p.kind,
          total,
          rows: opts.map((o) => ({ label: o.label, votes: v.get(o.id) ?? 0, pct: total ? Math.round(((v.get(o.id) ?? 0) / total) * 100) : 0 })),
          words: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([word, count]) => ({ word, count })),
        };
      }
      return { poll, handRaises: s.hands.size, cta: s.activeCta ? s.ctas.get(s.activeCta) ?? null : null };
    },
  };
  return s;
}

export function reduceOverlay(s: OverlayInternal, m: Msg): OverlayInternal {
  const { operation, table, record, old_record } = m.payload;
  const r = (record ?? old_record ?? {}) as Record<string, string | string[] | null>;
  switch (table) {
    case "slide_events":
      if (operation === "INSERT") {
        s.activePoll = (r.poll_id as string | null) ?? null;
        s.activeCta = (r.cta_id as string | null) ?? null;
      }
      break;
    case "polls":
      if (operation !== "DELETE") s.polls.set(r.id as string, { id: r.id as string, kind: r.kind as string, question: r.question as string });
      break;
    case "poll_options":
      if (operation === "INSERT") {
        const o = { id: r.id as string, poll_id: r.poll_id as string, index: Number(r.index), label: r.label as string };
        s.options.set(o.poll_id, [...(s.options.get(o.poll_id) ?? []).filter((x) => x.id !== o.id), o].sort((a, b) => a.index - b.index));
      }
      break;
    case "poll_responses":
      if (operation === "INSERT") {
        const pid = r.poll_id as string;
        const seen = s.responded.get(pid) ?? new Set<string>();
        if (seen.has(r.user_id as string)) break;
        seen.add(r.user_id as string);
        s.responded.set(pid, seen);
        const v = s.votes.get(pid) ?? new Map<string, number>();
        for (const id of (r.option_ids as string[] | null) ?? []) v.set(id, (v.get(id) ?? 0) + 1);
        s.votes.set(pid, v);
        if (r.text_answer) s.text.set(pid, [...(s.text.get(pid) ?? []), r.text_answer as string]);
      }
      break;
    case "ctas":
      if (operation !== "DELETE") s.ctas.set(r.id as string, { label: r.label as string });
      break;
    case "hand_raises":
      if (operation === "DELETE" || r.cleared_at) s.hands.delete(r.id as string);
      else s.hands.add(r.id as string);
      break;
  }
  return s;
}
