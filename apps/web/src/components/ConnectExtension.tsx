"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID ?? "";

declare global {
  interface Window {
    chrome?: { runtime?: { sendMessage: (id: string, msg: unknown, cb: (r: { ok: boolean; error?: string } | undefined) => void) => void; lastError?: { message: string } } };
  }
}

/**
 * Auth handoff: one click sends the host's Supabase session to the extension
 * over externally_connectable. The extension keeps it in chrome.storage.session.
 */
export function ConnectExtension() {
  const [msg, setMsg] = useState<string | null>(null);
  const connect = async () => {
    const rt = window.chrome?.runtime;
    if (!EXTENSION_ID) return setMsg("Set NEXT_PUBLIC_EXTENSION_ID to the id shown at chrome://extensions.");
    if (!rt?.sendMessage) return setMsg("Install the Cueline extension in Chrome first (load unpacked from apps/extension/dist).");
    const { data } = await supabaseBrowser().auth.getSession();
    if (!data.session) return setMsg("Sign in first.");
    rt.sendMessage(EXTENSION_ID, { type: "auth", access_token: data.session.access_token, refresh_token: data.session.refresh_token }, (r) => {
      if (rt.lastError || !r?.ok) setMsg(`Extension did not answer: ${rt.lastError?.message ?? r?.error ?? "unknown"}`);
      else setMsg("Extension connected. Open your deck in present mode.");
    });
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={() => void connect()} className="rounded border px-3 py-1 text-sm">Connect extension</button>
      {msg && <span className="text-xs text-neutral-500">{msg}</span>}
    </span>
  );
}
