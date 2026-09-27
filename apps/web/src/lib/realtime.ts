"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionBroadcast } from "@/lib/supabase/types";

/**
 * Listen on the private `session:{id}` broadcast channel. The DB trigger is the
 * only publisher; clients never subscribe to postgres_changes.
 */
export function subscribeSession(sb: SupabaseClient, sessionId: string, onMessage: (m: SessionBroadcast) => void, onStatus?: (s: string) => void) {
  const channel = sb.channel(`session:${sessionId}`, { config: { private: true } });
  channel.on("broadcast", { event: "*" }, (m) => onMessage(m as unknown as SessionBroadcast));
  void sb.realtime.setAuth().then(() => channel.subscribe((status) => onStatus?.(status)));
  return () => {
    void sb.removeChannel(channel);
  };
}
