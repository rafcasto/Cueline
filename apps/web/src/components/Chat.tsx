"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, Card, CardHeader, Input, cx } from "@/components/ui";
import { chatMessages, type SessionData } from "@/lib/session-state";
import type { ChatMessage } from "@/lib/supabase/types";

type Props = {
  state: SessionData;
  userId: string | null;
  /** The room's switch; off shows a note instead of the form. */
  enabled: boolean;
  /** Rejects with the database's reason, which is turned into a sentence here. */
  onSend: (body: string) => Promise<void>;
  /** Host moderation: hide a message, or bring it back. */
  host?: boolean;
  onHide?: (m: ChatMessage, hidden: boolean) => Promise<void>;
  /** No card chrome, for a tab panel that already has it. */
  bare?: boolean;
  className?: string;
};

/** What the database says, as the attendee should read it. */
function explain(message: string) {
  if (message.includes("slow down")) return "Slow down a little.";
  if (message.includes("chat is off")) return "The host has switched chat off.";
  if (message.includes("join the room")) return "Taking your seat, try again in a moment.";
  if (message.includes("ended")) return "The session has ended.";
  if (message.includes("between 1 and 500")) return "Messages are 1 to 500 characters.";
  return message;
}

/**
 * The session chat: everyone's messages in order, newest at the bottom, with the sender's
 * name from the participant list ("Host" for an org member). The list follows new messages
 * while the reader is at the bottom and offers a jump back when they have scrolled up.
 * Hidden messages are gone for everyone but their author, who sees them marked removed, and
 * the host, who can restore them.
 */
export function Chat({ state, userId, enabled, onSend, host, onHide, bare, className }: Props) {
  const messages = chatMessages(state, userId, host);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [behind, setBehind] = useState(0);
  const lastCount = useRef(messages.length);

  const scrollToEnd = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setBehind(0);
  };

  useEffect(() => {
    const added = messages.length - lastCount.current;
    lastCount.current = messages.length;
    if (added <= 0) return;
    if (atBottom.current) scrollToEnd();
    else setBehind((n) => n + added);
  }, [messages.length]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom.current) setBehind(0);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(text);
      setBody("");
      scrollToEnd();
    } catch (err) {
      setError(explain((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (uid: string) => state.participants[uid]?.display_name ?? "Host";
  const isHost = (uid: string) => !state.participants[uid];

  const inner = (
    <>
      <div className="relative">
        <div ref={listRef} onScroll={onScroll} className="max-h-[50vh] min-h-48 space-y-3 overflow-y-auto overscroll-contain pr-1" role="log" aria-live="polite" aria-label="Chat messages">
          {messages.length === 0 && <p className="py-8 text-center text-sm text-ink-muted">{enabled ? "No messages yet. Say hello." : "Chat is off for this room."}</p>}
          {messages.map((m) => {
            const mine = m.user_id === userId;
            const hidden = !!m.hidden_at;
            return (
              <div key={m.id} className={cx("group text-sm", hidden && "opacity-60")}>
                <div className="flex items-baseline gap-2">
                  <span className={cx("truncate font-semibold", mine ? "text-brand" : "text-ink")}>{mine && !host ? "You" : nameOf(m.user_id)}</span>
                  {isHost(m.user_id) && <Badge tone="brand">Host</Badge>}
                  <span className="shrink-0 text-xs tabular-nums text-ink-faint">{time(m.created_at)}</span>
                  {host && onHide && (
                    <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" onClick={() => void onHide(m, !hidden)}>
                      {hidden ? "Restore" : "Hide"}
                    </Button>
                  )}
                </div>
                {hidden && !host ? (
                  <p className="italic text-ink-muted">Removed by the host.</p>
                ) : (
                  <p className={cx("whitespace-pre-wrap break-words leading-relaxed text-ink", hidden && "line-through")}>{m.body}</p>
                )}
              </div>
            );
          })}
        </div>
        {behind > 0 && (
          <button type="button" onClick={scrollToEnd} className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-contrast shadow-float">
            {behind} new {behind === 1 ? "message" : "messages"} ↓
          </button>
        )}
      </div>
      {enabled && (
        <form onSubmit={(e) => void submit(e)} className="mt-4">
          <div className="flex gap-2">
            <Input value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} placeholder={userId ? "Say something" : "Taking your seat…"} aria-label="Your message" disabled={!userId} autoComplete="off" />
            <Button type="submit" size="md" className="shrink-0" disabled={!userId || !body.trim()} loading={busy}>
              Send
            </Button>
          </div>
          {error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </>
  );

  if (bare) return <div className={className}>{inner}</div>;
  return (
    <Card className={className}>
      <CardHeader title="Chat" description={host ? "Hide a message to take it off everyone's screen; its author sees it was removed." : undefined} />
      <div className="mt-4">{inner}</div>
    </Card>
  );
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
