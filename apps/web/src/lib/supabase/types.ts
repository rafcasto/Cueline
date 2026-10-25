// Hand-written row types for Phase 1. Replace with `pnpm db:types` output once the
// local stack is running; keep the names identical so call sites don't change.

export type OrgRole = "owner" | "host" | "presenter";
export type StripeMode = "test" | "live";
export type PlanStatus = "active" | "past_due" | "canceled";

export type Organisation = {
  id: string;
  name: string;
  plan: "free" | "starter" | "pro";
  created_at: string;
  /** The Stripe account (sandbox or live) the subscription was made in. */
  stripe_mode: StripeMode | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_status: PlanStatus;
  plan_price_lookup: string | null;
  plan_period_start: string | null;
  plan_period_end: string | null;
};

/** One paid session on top of the plan; see docs/BUSINESS-MODEL.md. */
export type EventPass = {
  id: string;
  org_id: string;
  invite_id: string | null;
  stripe_mode: StripeMode;
  stripe_session_id: string;
  status: "pending" | "paid" | "failed" | "refunded";
  amount_total: number | null;
  currency: string | null;
  used_by_session_id: string | null;
  created_at: string;
  updated_at: string;
};
export type SessionState = "waiting" | "live" | "ended";
export type StageState = "viewer" | "invited" | "live" | "revoked";
export type ActivityKind = "poll" | "quiz" | "wordcloud" | "cta";
export type CtaDestination = "stripe" | "embed" | "tab";
export type CtaAction = "view" | "tap" | "conversion";
export const REACTION_KINDS = ["like", "heart", "laugh", "sad", "wow", "clap"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export type WaitingRoomBackground = {
  /** The backdrop. `image_audio` is the first version's "picture with a track"; normalizeWaitingRoom() folds it into `image` + `audio_url`. */
  type: "image" | "video" | "image_audio";
  image_url?: string;
  video_url?: string;
  /** Music that loops while attendees wait, over a picture or a video. */
  audio_url?: string;
  /** Video only: play the video's own soundtrack instead of the music track. */
  video_sound?: boolean;
  /** 0–1 for whichever sound plays; see DEFAULT_VOLUME. */
  volume?: number;
};
export type WaitingRoomElement = {
  id: string;
  type: "text";
  /** Percent of the 16:9 canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number; // percent of canvas height
  color: string;
  align: "left" | "center" | "right";
  weight: "normal" | "bold";
};
export type WaitingRoom = { background: WaitingRoomBackground; elements: WaitingRoomElement[] };

/**
 * Where the presenter video sits against the deck page; see lib/stage-layout. `video` is the
 * custom position in percent of a 16:9 stage (a 16:9 box there is as tall as it is wide, so only `w`).
 */
export type StageLayoutMode = "default" | "talking_head" | "split" | "custom";
export type StageVideoBox = { x: number; y: number; w: number };
export type StageLayout = { mode: StageLayoutMode; video?: StageVideoBox };

/** Accent colour, logo and standing call to action; see normalizeBranding() in lib/branding. */
export type RoomBranding = { accent?: string; logo_url?: string; cta?: { label: string; url: string } };

export type Room = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  branding: RoomBranding;
  waiting_room: WaitingRoom;
  /** The host can switch the session chat off for the room. */
  chat_enabled: boolean;
  /** The stage layout the next session starts with: the host's last choice. */
  stage_layout: StageLayout;
  livekit_room: string;
  created_at: string;
};

export type Presentation = {
  id: string;
  org_id: string;
  room_id: string;
  name: string;
  storage_path: string;
  page_count: number;
  created_at: string;
};

export type Session = {
  id: string;
  org_id: string;
  room_id: string;
  presentation_id: string | null;
  state: SessionState;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  hls_url: string | null;
  egress_id: string | null;
  recording_url: string | null;
  /** Where the presenter video sits for attendees right now; the host changes it live. */
  layout: StageLayout;
  /** Counts against the plan's sessions this month; cleared when a false start is refunded. */
  counted: boolean;
  event_pass_id: string | null;
  /** The plan's audience cap when the session went live. */
  max_participants: number | null;
  /** Hard stop from the plan's session length. */
  ends_by: string | null;
};

export type ActivityOption = { id: string; label: string; correct?: boolean };
export type CtaConfig = { destination: CtaDestination; target: string };

export type Activity = {
  id: string;
  org_id: string;
  room_id: string;
  kind: ActivityKind;
  title: string;
  options: ActivityOption[];
  config: Partial<CtaConfig> & { max_words?: number };
  timer_seconds: number | null;
  points: number;
  sort_order: number;
  created_at: string;
};

export type ActivityRun = {
  id: string;
  org_id: string;
  session_id: string;
  activity_id: string;
  opened_at: string;
  closes_at: string | null;
  closed_at: string | null;
  results_shown_at: string | null;
  hidden_at: string | null;
};

export type ActivityResponse = {
  id: string;
  session_id: string;
  run_id: string;
  user_id: string;
  option_ids: string[];
  text_answer: string | null;
  is_correct: boolean | null;
  answered_ms: number | null;
  created_at: string;
};

export type RunTally = { run_id: string; index: number; option_id: string; label: string; correct: boolean; votes: number };
export type QuizScore = { session_id: string; user_id: string; display_name: string | null; points: number; correct: number; total_ms: number };

export type Participant = { session_id: string; user_id: string; display_name: string; joined_at: string };
export type StageRoster = { id: string; session_id: string; user_id: string; state: StageState; updated_at: string };
export type SlideEvent = { id: string; session_id: string; presentation_id: string | null; page_index: number; server_ts: string };

export type Question = {
  id: string;
  session_id: string;
  user_id: string;
  body: string;
  approved: boolean;
  answered_at: string | null;
  created_at: string;
};

/** One chat message. `hidden_at` is host moderation: gone for everyone but the author and the host. */
export type ChatMessage = { id: string; org_id: string | null; session_id: string; user_id: string; body: string; hidden_at: string | null; created_at: string };

export type HandRaise = { id: string; session_id: string; user_id: string; raised_at: string; cleared_at: string | null };

/** Shape of one message on the `session:{id}` broadcast channel (from realtime.broadcast_changes). */
export type SessionBroadcast<T = Record<string, unknown>> = {
  event: string; // table name
  payload: {
    operation: "INSERT" | "UPDATE" | "DELETE";
    table: string;
    schema: string;
    record: T | null;
    old_record: T | null;
  };
};

/** An invite link the organiser shares. Attendees register against it before entering the room. */
export type Invite = {
  id: string;
  org_id: string;
  room_id: string;
  token: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  /** IANA zone the host scheduled in; emails format the start time in it. */
  timezone: string;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
};

export type Registration = {
  id: string;
  org_id: string;
  room_id: string;
  invite_id: string;
  user_id: string;
  name: string;
  email: string;
  /** Six-character join code, typed with the email at /join. */
  code: string;
  /** Magic-link token, /a/<token>; never shown to other attendees. */
  access_token: string;
  created_at: string;
};

export type InviteEmailKind = "confirmation" | "reminder";
export type RegistrationEmailStatus = "queued" | "scheduled" | "sent" | "cancelled" | "failed";

/**
 * One step of a room's email sequence: the welcome (kind `confirmation`) goes out on registration,
 * reminders at minutes_before the start of each event. Events inherit these as InviteEmail rows.
 */
export type RoomEmail = {
  id: string;
  org_id: string;
  room_id: string;
  kind: InviteEmailKind;
  minutes_before: number | null;
  subject: string;
  body: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

/** One step of an event's email sequence, inherited from the room step in room_email_id; send times count back from the event's start. */
export type InviteEmail = {
  id: string;
  org_id: string;
  invite_id: string;
  /** The room step this was copied from; null for steps that predate room sequences. */
  room_email_id: string | null;
  kind: InviteEmailKind;
  minutes_before: number | null;
  subject: string;
  body: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

/** What Resend was asked to do for one registrant and one step. */
export type RegistrationEmail = {
  id: string;
  org_id: string;
  registration_id: string;
  invite_email_id: string;
  send_at: string;
  status: RegistrationEmailStatus;
  resend_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
