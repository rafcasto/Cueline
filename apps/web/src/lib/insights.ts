/**
 * Webinar insights for the host: who registered against who turned up, an engagement score per
 * attendee (the buying-intent signal), a fit score from scored poll answers, and the four-way
 * split of the audience those two make. Pure functions over rows the database already keeps
 * (`session_engagement`, registrations, participants); nothing here touches the network.
 */
import { registrationStatus, type SeatRow } from "@/lib/seats";
import type { ActivityOption, SessionEngagement } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Fit: a number on each answer
// ---------------------------------------------------------------------------
export const FIT_MAX = 10;

/** The fit of one option as stored: a whole number 0–FIT_MAX, anything else read as 0. */
export function optionFit(o: Pick<ActivityOption, "fit">): number {
  const n = Number(o.fit);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(FIT_MAX, Math.round(n)));
}

/** Whether any answer of the activity scores fit; such a poll counts toward the fit maximum of a session. */
export function hasFitScoring(options: Pick<ActivityOption, "fit">[]): boolean {
  return options.some((o) => optionFit(o) > 0);
}

/** The options as they are saved: `fit` kept only where it is above zero, so untouched rows stay as they were. */
export function withFit<T extends ActivityOption>(options: T[]): T[] {
  return options.map((o) => {
    const fit = optionFit(o);
    const { fit: _drop, ...rest } = o; // eslint-disable-line @typescript-eslint/no-unused-vars
    return (fit > 0 ? { ...rest, fit } : rest) as T;
  });
}

/** 0–100, or null while the session has asked nothing that scores fit. */
export function fitScore(row: Pick<SessionEngagement, "fit_points" | "fit_max">): number | null {
  if (row.fit_max <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((row.fit_points / row.fit_max) * 100)));
}

// ---------------------------------------------------------------------------
// Engagement: what the person did in the session, as one number
// ---------------------------------------------------------------------------
/**
 * Each signal is worth some points, up to a cap; the score is the share of what was possible in
 * that session (a session with no polls does not hold the answering points against anyone). A
 * paid order is the strongest signal there is and is scored as 100 outright.
 */
export const ENGAGEMENT_WEIGHTS = {
  /** Turned up at all. */
  present: 10,
  /** Answered the polls, quizzes and word clouds offered: full points for all of them. */
  answers: 30,
  /** Asked a question, and a little more for a second. */
  question: 15,
  secondQuestion: 5,
  /** Three chat messages earn the whole of it. */
  chat: 10,
  chatFull: 3,
  /** Two upvotes earn the whole of it. */
  upvotes: 5,
  upvotesFull: 2,
  /** Five reactions earn the whole of it. */
  reactions: 5,
  reactionsFull: 5,
  /** Put a hand up. */
  handRaise: 10,
  /** Tapped a call-to-action button: the clearest intent short of paying. */
  ctaTap: 20,
} as const;

export type EngagementRow = Pick<SessionEngagement, "runs_total" | "cta_runs" | "answers" | "questions" | "upvotes" | "chat_messages" | "hand_raises" | "reactions" | "cta_taps" | "orders_paid">;

/** 0–100. */
export function engagementScore(r: EngagementRow): number {
  if (r.orders_paid > 0) return 100;
  const w = ENGAGEMENT_WEIGHTS;
  let earned = w.present;
  let possible = w.present;
  if (r.runs_total > 0) {
    possible += w.answers;
    earned += w.answers * Math.min(1, r.answers / r.runs_total);
  }
  possible += w.question + w.secondQuestion;
  if (r.questions >= 1) earned += w.question;
  if (r.questions >= 2) earned += w.secondQuestion;
  possible += w.chat;
  earned += w.chat * Math.min(1, r.chat_messages / w.chatFull);
  possible += w.upvotes;
  earned += w.upvotes * Math.min(1, r.upvotes / w.upvotesFull);
  possible += w.reactions;
  earned += w.reactions * Math.min(1, r.reactions / w.reactionsFull);
  possible += w.handRaise;
  if (r.hand_raises >= 1) earned += w.handRaise;
  if (r.cta_runs > 0) {
    possible += w.ctaTap;
    if (r.cta_taps >= 1) earned += w.ctaTap;
  }
  return Math.max(0, Math.min(100, Math.round((earned / possible) * 100)));
}

/** Short words for what someone did, for the attendee table: "3 of 4 answers · 1 question · tapped the call to action". */
export function signalSummary(r: EngagementRow): string[] {
  const out: string[] = [];
  if (r.orders_paid > 0) out.push(r.orders_paid === 1 ? "paid" : `${r.orders_paid} orders`);
  if (r.cta_taps > 0) out.push("tapped the call to action");
  if (r.runs_total > 0) out.push(`${Math.min(r.answers, r.runs_total)} of ${r.runs_total} ${r.runs_total === 1 ? "answer" : "answers"}`);
  if (r.questions > 0) out.push(`${r.questions} ${r.questions === 1 ? "question" : "questions"}`);
  if (r.hand_raises > 0) out.push("hand up");
  if (r.chat_messages > 0) out.push(`${r.chat_messages} chat`);
  if (r.upvotes > 0) out.push(`${r.upvotes} ${r.upvotes === 1 ? "upvote" : "upvotes"}`);
  if (r.reactions > 0) out.push(`${r.reactions} ${r.reactions === 1 ? "reaction" : "reactions"}`);
  return out;
}

// ---------------------------------------------------------------------------
// The four-way split: intent × fit
// ---------------------------------------------------------------------------
export type Quadrant = "hot" | "eager" | "nurture" | "cold";
export type Thresholds = { engagement: number; fit: number };
export const DEFAULT_THRESHOLDS: Thresholds = { engagement: 50, fit: 50 };

export function quadrantOf(engagement: number, fit: number, t: Thresholds = DEFAULT_THRESHOLDS): Quadrant {
  const high = engagement >= t.engagement;
  const fits = fit >= t.fit;
  if (high && fits) return "hot";
  if (high) return "eager";
  if (fits) return "nurture";
  return "cold";
}

export const QUADRANTS: Record<Quadrant, { title: string; intent: string; fit: string; summary: string; actions: string[] }> = {
  hot: {
    title: "Ready to buy",
    intent: "High intent",
    fit: "High fit",
    summary: "They did the things buyers do and they are the people you built this for.",
    actions: [
      "Reach out personally within a day, while the session is fresh: a short note that names something they asked or answered.",
      "Send the offer or book the call; do not make them wait for a sequence.",
      "If they tapped a call to action but did not pay, ask what held them back.",
    ],
  },
  eager: {
    title: "Eager, not a fit",
    intent: "High intent",
    fit: "Low fit",
    summary: "They leaned in, but their answers say the product is not built for them.",
    actions: [
      "Qualify before you sell: a quick reply that sets expectations saves a refund later.",
      "Point them to the tier, product or partner that fits what they told you.",
      "Keep them warm with content; they may become a fit, or send someone who is.",
    ],
  },
  nurture: {
    title: "Right people, not yet convinced",
    intent: "Low intent",
    fit: "High fit",
    summary: "The audience you want, quiet in the room. Work on the objections, not the pitch.",
    actions: [
      "Send the recording with a note on the part that answers their likely objection.",
      "Put them on a follow-up sequence: a case study, a question to reply to, an invitation to the next session.",
      "Ask one question by email (what would make this useful for you?) and read the replies.",
    ],
  },
  cold: {
    title: "Watchers",
    intent: "Low intent",
    fit: "Low fit",
    summary: "Registered, turned up, did little, and are not who the product is for.",
    actions: [
      "Keep them on the list and in the newsletter; spend no sales time here.",
      "Check the registration page and topics if this group is large: it may be drawing the wrong crowd.",
    ],
  },
};

export type ScoredAttendee = {
  user_id: string;
  display_name: string;
  engagement: number;
  /** Null while the session scored no fit. */
  fit: number | null;
  /** Null while the fit is unknown. */
  quadrant: Quadrant | null;
  signals: string[];
  row: SessionEngagement;
};

/** Score every attendee of a session, most engaged first. */
export function scoreAttendees(rows: SessionEngagement[], t: Thresholds = DEFAULT_THRESHOLDS): ScoredAttendee[] {
  return rows
    .map((row) => {
      const engagement = engagementScore(row);
      const fit = fitScore(row);
      return { user_id: row.user_id, display_name: row.display_name, engagement, fit, quadrant: fit === null ? null : quadrantOf(engagement, fit, t), signals: signalSummary(row), row };
    })
    .sort((a, b) => b.engagement - a.engagement || (b.fit ?? -1) - (a.fit ?? -1) || a.display_name.localeCompare(b.display_name));
}

export function byQuadrant(list: ScoredAttendee[]): Record<Quadrant, ScoredAttendee[]> {
  const out: Record<Quadrant, ScoredAttendee[]> = { hot: [], eager: [], nurture: [], cold: [] };
  for (const a of list) if (a.quadrant) out[a.quadrant].push(a);
  return out;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((n, v) => n + v, 0) / values.length);
}

// ---------------------------------------------------------------------------
// Registered against attended
// ---------------------------------------------------------------------------
/** How far apart an event's start and a session's start may be for the session to count as that event. */
export const EVENT_SESSION_WINDOW_MS = 12 * 60 * 60 * 1000;

export type EventLike = { id: string; title: string; starts_at: string | null; created_at: string; revoked_at: string | null };
export type SessionLike = { id: string; started_at: string | null; created_at: string; state: string };

/**
 * The sessions that were this event's webinar. An event with a start time claims the sessions
 * that started within twelve hours of it; one without claims every session that opened after
 * the link was made and before it was revoked. A session that never went live counts for nobody.
 */
export function sessionsForEvent(event: EventLike, sessions: SessionLike[]): SessionLike[] {
  return sessions.filter((s) => {
    if (!s.started_at) return false;
    const started = new Date(s.started_at).getTime();
    if (event.starts_at) return Math.abs(started - new Date(event.starts_at).getTime()) <= EVENT_SESSION_WINDOW_MS;
    if (started < new Date(event.created_at).getTime()) return false;
    return !event.revoked_at || started <= new Date(event.revoked_at).getTime();
  });
}

export type RegistrationLike = SeatRow & { invite_id: string; user_id: string };

export type EventFunnel = {
  event: EventLike;
  /** Everyone who registered and did not opt out, seated or waiting. */
  registered: number;
  seated: number;
  waiting: number;
  cancelled: number;
  /** Registrants who joined one of the event's sessions. */
  attended: number;
  /** attended / registered, as a percentage; null until anyone registered. */
  showUp: number | null;
  /** The sessions the event was matched to. */
  sessions: SessionLike[];
};

/**
 * Registered against attended, per event. Attendance is a registrant's identity turning up in
 * `participants` of one of the event's sessions; the identity is the one the registration is
 * bound to now, so someone who registered on one device and came in on another through their
 * personal link is matched, since the link re-binds the registration to that device.
 */
export function eventFunnels(events: EventLike[], registrations: RegistrationLike[], sessions: SessionLike[], participantsBySession: Record<string, string[]>): EventFunnel[] {
  return events.map((event) => {
    const matched = sessionsForEvent(event, sessions);
    const joined = new Set<string>();
    for (const s of matched) for (const uid of participantsBySession[s.id] ?? []) joined.add(uid);
    const regs = registrations.filter((r) => r.invite_id === event.id);
    let seated = 0;
    let waiting = 0;
    let cancelled = 0;
    let attended = 0;
    for (const r of regs) {
      const status = registrationStatus(r);
      if (status === "cancelled") cancelled++;
      else if (status === "waitlisted") waiting++;
      else seated++;
      if (status !== "cancelled" && joined.has(r.user_id)) attended++;
    }
    const registered = seated + waiting;
    return { event, registered, seated, waiting, cancelled, attended, showUp: registered ? Math.round((attended / registered) * 100) : null, sessions: matched };
  });
}

/** The funnel over every event at once. */
export function totalFunnel(funnels: EventFunnel[]): Pick<EventFunnel, "registered" | "seated" | "waiting" | "cancelled" | "attended" | "showUp"> {
  const sum = (k: "registered" | "seated" | "waiting" | "cancelled" | "attended") => funnels.reduce((n, f) => n + f[k], 0);
  const registered = sum("registered");
  const attended = sum("attended");
  return { registered, seated: sum("seated"), waiting: sum("waiting"), cancelled: sum("cancelled"), attended, showUp: registered ? Math.round((attended / registered) * 100) : null };
}
