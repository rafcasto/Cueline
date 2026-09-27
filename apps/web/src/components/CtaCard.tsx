"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { StripeCheckout } from "@/components/StripeCheckout";
import type { Cta } from "@/lib/supabase/types";

type Props = { cta: Cta; sessionId: string; roomSlug: string; slideId: string | null; readOnly?: boolean };

/**
 * Logs a `view` when shown and a `tap` before any checkout loads, so abandonment
 * is captured. Embedded targets try an iframe first and fall back to a new tab
 * when the site refuses framing.
 */
export function CtaCard({ cta, sessionId, roomSlug, slideId, readOnly }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const viewed = useRef<string | null>(null);

  useEffect(() => {
    if (readOnly || viewed.current === cta.id) return;
    viewed.current = cta.id;
    void api("/api/cta/event", { cta_id: cta.id, session_id: sessionId, slide_id: slideId, action: "view" }).catch(() => undefined);
  }, [cta.id, sessionId, slideId, readOnly]);

  const tap = async () => {
    setBusy(true);
    try {
      const { cta_event_id } = await api<{ cta_event_id: string }>("/api/cta/event", { cta_id: cta.id, session_id: sessionId, slide_id: slideId, action: "tap" });
      if (cta.destination === "stripe") {
        const { client_secret } = await api<{ client_secret: string }>("/api/cta/checkout", { cta_id: cta.id, cta_event_id, room_slug: roomSlug });
        setClientSecret(client_secret);
      } else if (cta.destination === "tab" || embedFailed) {
        window.open(cta.target, "_blank", "noopener");
      } else {
        setEmbedFailed(false);
        setClientSecret("embed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm dark:border-amber-700 dark:bg-amber-950">
      <h3 className="font-semibold">{cta.label}</h3>
      {!clientSecret && !readOnly && (
        <button onClick={() => void tap()} disabled={busy} className="mt-3 rounded bg-amber-600 px-4 py-2 font-medium text-white disabled:opacity-50">
          {cta.destination === "stripe" ? "Buy now" : "Open"}
        </button>
      )}
      {readOnly && <p className="mt-2 text-xs text-neutral-500">{cta.destination} · {cta.target}</p>}
      {clientSecret && cta.destination === "stripe" && <div className="mt-3 rounded bg-white"><StripeCheckout clientSecret={clientSecret} /></div>}
      {clientSecret === "embed" && cta.destination === "embed" && (
        <EmbedFrame url={cta.target} onBlocked={() => { setEmbedFailed(true); setClientSecret(null); window.open(cta.target, "_blank", "noopener"); }} />
      )}
    </section>
  );
}

/**
 * Most SaaS signup pages send X-Frame-Options: DENY. A blocked frame never fires
 * `load` with content we can inspect, so we give it a few seconds and then fall back.
 */
function EmbedFrame({ url, onBlocked }: { url: string; onBlocked: () => void }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!loaded) onBlocked();
    }, 4000);
    return () => clearTimeout(t);
  }, [loaded, onBlocked]);
  return <iframe src={url} onLoad={() => setLoaded(true)} className="mt-3 h-[480px] w-full rounded border bg-white" sandbox="allow-forms allow-scripts allow-same-origin allow-popups" />;
}
