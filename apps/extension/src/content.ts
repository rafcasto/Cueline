/**
 * Content script on docs.google.com/presentation/*.
 *   1. Detect present mode and report the current slide id (URL first, DOM fallback).
 *   2. Hand it to the background worker, which POSTs /api/slide-event.
 *   3. Draw poll results over the slide canvas in a Shadow DOM overlay.
 */
import type { OverlayState, SlideReport, ToContent } from "./shared";

const POLL_MS = 200;
const DEBOUNCE_MS = 150;

function presentationId(): string | null {
  return /\/presentation\/d\/([A-Za-z0-9_-]+)/.exec(location.pathname)?.[1] ?? null;
}

/** Present mode and presenter view both live under /present or /presentation?... with a slide= param. */
function inPresentMode(): boolean {
  return /\/(present|presentation)(\/|$|\?)/.test(location.pathname + location.search) || location.search.includes("slide=id.");
}

function slideFromUrl(): string | null {
  const m = /[?&#]slide=(id\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]+)/.exec(location.href);
  return m ? m[1] : null;
}

/** Fallback when the URL does not update: read Google's own slide counter / aria labels. */
function slideFromDom(): string | null {
  const labelled = document.querySelector<HTMLElement>('[aria-label^="Slide "], [aria-label*=" of "]');
  const text = labelled?.getAttribute("aria-label") ?? "";
  const m = /Slide (\d+)/i.exec(text) ?? /(\d+)\s+of\s+\d+/.exec(text);
  return m ? `index:${Number(m[1]) - 1}` : null;
}

let last: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let port: chrome.runtime.Port | null = null;

function connect() {
  port = chrome.runtime.connect({ name: "cueline-content" });
  port.onMessage.addListener((m: ToContent) => {
    if (m.type === "overlay") renderOverlay(m.state);
  });
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connect, 1000);
  });
  const pid = presentationId();
  if (pid) port.postMessage({ type: "subscribe", presentationId: pid });
}

function report(slideObjectId: string) {
  const pid = presentationId();
  if (!pid || !port) return;
  const msg: SlideReport = { type: "slide", presentationId: pid, slideObjectId, clientTs: Date.now() };
  port.postMessage(msg);
}

function tick() {
  if (!inPresentMode()) return;
  const id = slideFromUrl() ?? slideFromDom();
  if (!id || id === last) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (id === last) return;
    last = id;
    report(id);
  }, DEBOUNCE_MS);
}

// Keep the service worker alive while a deck is open; extension messaging resets its idle timer.
setInterval(() => port?.postMessage({ type: "keepalive" }), 20_000);
setInterval(tick, POLL_MS);
connect();

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------
let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;

function canvas(): HTMLElement {
  return (
    document.querySelector<HTMLElement>(".punch-present-iframe, .punch-viewer-content, .punch-full-screen-element, .punch-viewer-container") ??
    document.body
  );
}

function ensureOverlay() {
  if (host && shadow) return shadow;
  host = document.createElement("div");
  host.id = "cueline-overlay";
  host.style.cssText = "position:fixed;right:24px;bottom:24px;z-index:2147483647;pointer-events:none;max-width:min(38vw,460px);";
  shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .card { font: 15px/1.35 system-ui, sans-serif; color: #fff; background: rgba(17,17,20,.86); backdrop-filter: blur(6px);
              border-radius: 14px; padding: 14px 16px; box-shadow: 0 8px 30px rgba(0,0,0,.35); margin-top: 10px; }
      .q { font-weight: 600; font-size: 17px; margin-bottom: 8px; }
      .row { display:flex; justify-content:space-between; font-size:14px; margin-top:6px; }
      .bar { height: 8px; background: rgba(255,255,255,.18); border-radius: 4px; margin-top: 3px; overflow:hidden; }
      .fill { height: 100%; background: #7c83ff; transition: width .4s ease; }
      .muted { opacity: .7; font-size: 12px; margin-top: 8px; }
      .cloud { display:flex; flex-wrap:wrap; gap:6px 10px; }
      .badge { display:inline-block; background:#f59e0b; color:#111; font-weight:600; border-radius:999px; padding:4px 10px; font-size:13px; }
    </style>
    <div id="root"></div>`;
  (canvas() === document.body ? document.body : document.documentElement).appendChild(host);
  return shadow;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function renderOverlay(state: OverlayState) {
  const root = ensureOverlay().getElementById("root")!;
  if (!inPresentMode() || !state.sessionId) {
    root.innerHTML = "";
    return;
  }
  const parts: string[] = [];
  if (state.poll) {
    const p = state.poll;
    let body = "";
    if (p.kind === "text") {
      body = `<div class="cloud">${p.words
        .map((w) => `<span style="font-size:${Math.min(2.1, 0.9 + w.count * 0.22)}em">${esc(w.word)}</span>`)
        .join("")}</div>`;
    } else {
      body = p.rows
        .map((r) => `<div class="row"><span>${esc(r.label)}</span><span>${r.pct}% · ${r.votes}</span></div><div class="bar"><div class="fill" style="width:${r.pct}%"></div></div>`)
        .join("");
    }
    parts.push(`<div class="card"><div class="q">${esc(p.question)}</div>${body}<div class="muted">${p.total} responses</div></div>`);
  }
  if (state.cta) parts.push(`<div class="card"><span class="badge">CTA live</span> &nbsp;${esc(state.cta.label)}</div>`);
  if (state.handRaises > 0) parts.push(`<div class="card">✋ ${state.handRaises} hand${state.handRaises === 1 ? "" : "s"} raised</div>`);
  root.innerHTML = parts.join("");
}
