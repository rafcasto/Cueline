/**
 * Service worker. Owns everything that touches the network:
 *   - the host's Supabase session (handed over from the web app, kept in chrome.storage.session)
 *   - POST /api/slide-event for each slide change
 *   - the realtime subscription to the live session, reduced into overlay state for the content script
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { APP_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "./shared";
import type { AuthHandoff, OverlayState, Keepalive, SignOut, SlideReport, Status, StatusRequest, Subscribe, ToContent } from "./shared";
import { emptyOverlay, reduceOverlay, type OverlayInternal } from "./overlay-state";

type Tokens = { access_token: string; refresh_token: string };

let sb: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let liveSessionId: string | null = null;
let overlay: OverlayInternal = emptyOverlay();
let lastSlide: string | null = null;
const ports = new Set<chrome.runtime.Port>();

function client() {
  if (!sb) {
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
    sb.auth.onAuthStateChange((_e, session) => {
      if (session) void chrome.storage.session.set({ tokens: { access_token: session.access_token, refresh_token: session.refresh_token } });
    });
  }
  return sb;
}

async function restore() {
  const { tokens } = (await chrome.storage.session.get("tokens")) as { tokens?: Tokens };
  if (tokens) await client().auth.setSession(tokens);
}

async function accessToken(): Promise<string | null> {
  const { data } = await client().auth.getSession();
  return data.session?.access_token ?? null;
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  if (!token) throw new Error("not connected");
  const res = await fetch(`${APP_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${path} ${res.status}`);
  return data;
}

function broadcastOverlay() {
  const state: OverlayState = { sessionId: liveSessionId, ...overlay.view() };
  const msg: ToContent = { type: "overlay", state };
  for (const p of ports) p.postMessage(msg);
}

async function subscribe(sessionId: string) {
  if (liveSessionId === sessionId && channel) return;
  if (channel) await client().removeChannel(channel);
  liveSessionId = sessionId;
  overlay = emptyOverlay();
  await overlay.load(client(), sessionId);
  await client().realtime.setAuth();
  channel = client()
    .channel(`session:${sessionId}`, { config: { private: true } })
    .on("broadcast", { event: "*" }, (m) => {
      overlay = reduceOverlay(overlay, m as never);
      broadcastOverlay();
    })
    .subscribe();
  broadcastOverlay();
}

async function handleSlide(msg: SlideReport) {
  lastSlide = msg.slideObjectId;
  const r = await api<{ active: boolean; session_id?: string }>("/api/slide-event", {
    presentation_id: msg.presentationId,
    slide_object_id: msg.slideObjectId,
    client_ts: msg.clientTs,
  });
  if (r.active && r.session_id) await subscribe(r.session_id);
  else {
    liveSessionId = null;
    broadcastOverlay();
  }
}

async function findLiveSession(presentationId: string) {
  const me = await api<{ live_sessions: { id: string; presentation_id: string | null }[] }>("/api/me");
  const s = me.live_sessions.find((x) => x.presentation_id === presentationId);
  if (s) await subscribe(s.id);
}

async function status(): Promise<Status> {
  try {
    const me = await api<{ user: { email: string | null; name: string | null }; live_sessions: { id: string; presentation_id: string | null; room: { slug: string; name: string } | null }[] }>("/api/me");
    const s = me.live_sessions[0];
    return {
      connected: true,
      user: me.user,
      session: s ? { id: s.id, room: s.room?.name ?? s.room?.slug ?? "", presentationId: s.presentation_id } : null,
      lastSlide,
    };
  } catch (err) {
    return { connected: false, error: (err as Error).message };
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "cueline-content") return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener((m: SlideReport | Keepalive | Subscribe) => {
    void restore().then(async () => {
      if (m.type === "slide") await handleSlide(m).catch((e) => console.warn("slide-event", e));
      else if (m.type === "subscribe") await findLiveSession(m.presentationId).catch(() => undefined);
    });
  });
  broadcastOverlay();
});

// Auth handoff from the web app (externally_connectable) and popup requests.
chrome.runtime.onMessageExternal.addListener((m: AuthHandoff, _sender, reply) => {
  if (m?.type !== "auth") return;
  client()
    .auth.setSession({ access_token: m.access_token, refresh_token: m.refresh_token })
    .then(({ error }) => reply({ ok: !error, error: error?.message }));
  return true;
});

chrome.runtime.onMessage.addListener((m: StatusRequest | SignOut, _sender, reply) => {
  void restore().then(async () => {
    if (m.type === "status") reply(await status());
    else if (m.type === "signout") {
      await chrome.storage.session.remove("tokens");
      await client().auth.signOut();
      reply({ ok: true });
    }
  });
  return true;
});

// Refresh the host token well before expiry even when no deck is open.
chrome.alarms.create("refresh", { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(() => void restore().then(() => client().auth.refreshSession()));
