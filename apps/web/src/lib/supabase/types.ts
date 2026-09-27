// Hand-written row types for Phase 1. Replace with `pnpm db:types` output once the
// local stack is running; keep the names identical so call sites don't change.

export type OrgRole = "owner" | "host" | "presenter";
export type StageState = "viewer" | "invited" | "live" | "revoked";
export type CueKind = "poll" | "multipoll" | "text" | "cta";
export type CtaDestination = "stripe" | "embed" | "tab";
export type CtaAction = "view" | "tap" | "conversion";

export type Room = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  branding: Record<string, unknown>;
  livekit_room: string;
};

export type Session = {
  id: string;
  org_id: string;
  room_id: string;
  presentation_id: string | null;
  started_at: string;
  ended_at: string | null;
  hls_url: string | null;
  egress_id: string | null;
  recording_url: string | null;
};

export type DeckSlide = {
  id: string;
  org_id: string;
  presentation_id: string;
  slide_object_id: string;
  index: number;
  notes: string | null;
  poll_payload: { kind: "poll" | "multipoll"; question: string; options: string[] } | { kind: "text"; question: string } | null;
  cta_payload: { kind: "cta"; label: string; destination: CtaDestination; target: string } | null;
};

export type StageRoster = {
  id: string;
  session_id: string;
  user_id: string;
  state: StageState;
  updated_at: string;
};

export type SlideEvent = {
  id: string;
  session_id: string;
  slide_object_id: string;
  index: number | null;
  server_ts: string;
  forced: boolean;
  poll_id: string | null;
  cta_id: string | null;
};

export type Poll = {
  id: string;
  session_id: string;
  slide_object_id: string | null;
  kind: CueKind;
  question: string;
  opened_at: string;
  closed_at: string | null;
};

export type PollOption = { id: string; poll_id: string; index: number; label: string };
export type PollTally = { poll_id: string; option_id: string; index: number; label: string; votes: number };

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

export type Cta = {
  id: string;
  session_id: string;
  slide_object_id: string | null;
  label: string;
  destination: CtaDestination;
  target: string;
};

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
