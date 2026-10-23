// Hand-written row types for Phase 1. Replace with `pnpm db:types` output once the
// local stack is running; keep the names identical so call sites don't change.

export type OrgRole = "owner" | "host" | "presenter";
export type SessionState = "waiting" | "live" | "ended";
export type StageState = "viewer" | "invited" | "live" | "revoked";
export type ActivityKind = "poll" | "quiz" | "wordcloud" | "cta";
export type CtaDestination = "stripe" | "embed" | "tab";
export type CtaAction = "view" | "tap" | "conversion";
export const REACTION_KINDS = ["like", "heart", "laugh", "sad", "wow", "clap"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export type WaitingRoomBackground = {
  type: "image" | "video" | "image_audio";
  image_url?: string;
  video_url?: string;
  audio_url?: string;
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

export type Room = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  branding: Record<string, unknown>;
  waiting_room: WaitingRoom;
  livekit_room: string;
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
  created_at: string;
};
