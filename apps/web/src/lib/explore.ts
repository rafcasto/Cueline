/**
 * The public directory: rooms that chose to be listed and the public events in them. Read
 * through the `public_rooms` and `public_events` views with the anonymous client, so what the
 * page can show is exactly what any visitor could fetch.
 */
import { supabaseServer } from "@/lib/supabase/server";
import type { RoomBranding, SessionState } from "@/lib/supabase/types";

export type PublicEvent = {
  id: string;
  token: string;
  title: string;
  description: string | null;
  starts_at: string;
  timezone: string;
  created_at: string;
  room_id: string;
  room_slug: string;
  room_name: string;
  room_branding: RoomBranding;
  room_topics: string[];
  going: number;
  session_state: SessionState | null;
};

export type PublicRoom = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  topics: string[];
  branding: RoomBranding;
  created_at: string;
  upcoming_events: number;
  past_events: number;
  people: number;
  session_state: SessionState | null;
};

export type ExploreQuery = { q?: string; topic?: string };

/** An event stays "upcoming" for two hours after its start, so a session that is running is still found. */
export function upcomingSince(now = new Date()) {
  return new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
}

const escapeLike = (s: string) => s.replace(/[%_\\]/g, (c) => `\\${c}`);

export async function listPublicEvents(query: ExploreQuery, limit = 60): Promise<PublicEvent[]> {
  const sb = await supabaseServer();
  let req = sb.from("public_events").select("*").gte("starts_at", upcomingSince()).order("starts_at").limit(limit);
  const q = query.q?.trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    req = req.or(`title.ilike.${like},description.ilike.${like},room_name.ilike.${like}`);
  }
  if (query.topic) req = req.contains("room_topics", [normalizeTopic(query.topic)]);
  const { data } = await req;
  return (data ?? []) as PublicEvent[];
}

export async function listPublicRooms(query: ExploreQuery, limit = 60): Promise<PublicRoom[]> {
  const sb = await supabaseServer();
  let req = sb.from("public_rooms").select("*").order("upcoming_events", { ascending: false }).order("people", { ascending: false }).order("name").limit(limit);
  const q = query.q?.trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    req = req.or(`name.ilike.${like},description.ilike.${like}`);
  }
  if (query.topic) req = req.contains("topics", [normalizeTopic(query.topic)]);
  const { data } = await req;
  return (data ?? []) as PublicRoom[];
}

export async function publicRoomBySlug(slug: string): Promise<{ room: PublicRoom; upcoming: PublicEvent[]; past: PublicEvent[] } | null> {
  const sb = await supabaseServer();
  const { data: room } = await sb.from("public_rooms").select("*").eq("slug", slug).maybeSingle();
  if (!room) return null;
  const since = upcomingSince();
  const [{ data: upcoming }, { data: past }] = await Promise.all([
    sb.from("public_events").select("*").eq("room_id", room.id).gte("starts_at", since).order("starts_at"),
    sb.from("public_events").select("*").eq("room_id", room.id).lt("starts_at", since).order("starts_at", { ascending: false }).limit(12),
  ]);
  return { room: room as PublicRoom, upcoming: (upcoming ?? []) as PublicEvent[], past: (past ?? []) as PublicEvent[] };
}

/** Every topic in use across listed rooms, most used first; the filter chips on /explore. */
export async function listTopics(): Promise<{ topic: string; rooms: number }[]> {
  const sb = await supabaseServer();
  const { data } = await sb.from("public_rooms").select("topics");
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { topics: string[] }[]) for (const t of r.topics ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([topic, rooms]) => ({ topic, rooms }))
    .sort((a, b) => b.rooms - a.rooms || a.topic.localeCompare(b.topic));
}

// ---------------------------------------------------------------------------
// Topics and formatting
// ---------------------------------------------------------------------------

export const TOPIC_PATTERN = /^[a-z0-9][a-z0-9 -]{0,28}[a-z0-9]$/;
export const MAX_TOPICS = 6;

export function normalizeTopic(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** "design, Product  Management, design" -> ["design", "product management"]; the error names the bad one. */
export function parseTopics(raw: unknown): { topics: string[] } | { error: string } {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const topics: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") return { error: "Topics must be text." };
    const t = normalizeTopic(item);
    if (!t) continue;
    if (!TOPIC_PATTERN.test(t)) return { error: `"${t}" is not a valid topic: 2 to 30 letters, digits, spaces or hyphens.` };
    if (!topics.includes(t)) topics.push(t);
  }
  if (topics.length > MAX_TOPICS) return { error: `Up to ${MAX_TOPICS} topics.` };
  return { topics };
}

/** The event's start in the host's zone, rendered on the server so every visitor sees the same text. */
export function formatEventTime(iso: string, timezone: string): { day: string; time: string } {
  const d = new Date(iso);
  let tz = timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  return {
    day: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz }),
    time: d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: tz }),
  };
}

export function eventStatus(e: Pick<PublicEvent, "starts_at" | "session_state">, now = new Date()): "live" | "soon" | "upcoming" | "past" {
  if (e.session_state === "live") return "live";
  const start = new Date(e.starts_at).getTime();
  if (start < now.getTime() - 2 * 60 * 60 * 1000) return "past";
  if (start - now.getTime() < 60 * 60 * 1000) return "soon";
  return "upcoming";
}
