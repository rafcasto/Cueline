import { env } from "@/lib/env";

/**
 * Thin client for the Resend REST API. The surface we need is three calls, so this is plain
 * fetch rather than the SDK: one fewer dependency and trivially mockable in tests.
 * https://resend.com/docs/api-reference/emails
 */
const BASE = "https://api.resend.com";

/** Resend accepts a scheduled_at up to this far ahead; anything later waits in our queue. */
export const RESEND_SCHEDULE_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

export type SendInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** ISO timestamp; omit to send now. */
  scheduledAt?: string;
  replyTo?: string;
};

export class ResendError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${env("RESEND_API_KEY")}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; name?: string };
  if (!res.ok) throw new ResendError(res.status, data.message ?? data.name ?? `Resend ${method} ${path} failed (${res.status})`);
  return data;
}

export const resend = {
  /** Returns the Resend email id. */
  async send(input: SendInput): Promise<string> {
    const r = await call<{ id: string }>("POST", "/emails", {
      from: env("RESEND_FROM"),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      reply_to: input.replyTo,
      scheduled_at: input.scheduledAt,
    });
    return r.id;
  },
  async reschedule(id: string, scheduledAt: string): Promise<void> {
    await call("PATCH", `/emails/${id}`, { scheduled_at: scheduledAt });
  },
  /** Cancelling an email that already went out is not an error for us. */
  async cancel(id: string): Promise<void> {
    try {
      await call("POST", `/emails/${id}/cancel`, undefined);
    } catch (err) {
      if (err instanceof ResendError && (err.status === 404 || err.status === 422)) return;
      throw err;
    }
  },
};

/** True when email sending is configured; without it registrations still work, emails are skipped. */
export function emailConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM;
}
