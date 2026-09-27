/** Messages between content script, background worker, popup and the web app. */
declare const __APP_URL__: string;
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;

export const APP_URL = __APP_URL__;
export const SUPABASE_URL = __SUPABASE_URL__;
export const SUPABASE_ANON_KEY = __SUPABASE_ANON_KEY__;

export type SlideReport = { type: "slide"; presentationId: string; slideObjectId: string; clientTs: number };
export type AuthHandoff = { type: "auth"; access_token: string; refresh_token: string };
export type StatusRequest = { type: "status" };
export type SignOut = { type: "signout" };
export type Keepalive = { type: "keepalive" };
export type Subscribe = { type: "subscribe"; presentationId: string };

export type Status = {
  connected: boolean;
  user?: { email: string | null; name: string | null };
  session?: { id: string; room: string; presentationId: string | null } | null;
  lastSlide?: string | null;
  error?: string;
};

/** What the background pushes to the content script for the overlay. */
export type OverlayState = {
  sessionId: string | null;
  poll: { question: string; kind: string; rows: { label: string; votes: number; pct: number }[]; total: number; words: { word: string; count: number }[] } | null;
  handRaises: number;
  cta: { label: string } | null;
};

export type ToContent = { type: "overlay"; state: OverlayState };
