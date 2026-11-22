"use client";

/** A non-2xx answer: the server's message, and its `code` where it gave one ("plan_limit", "room_locked"). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string | null = null) {
    super(message);
  }
}

/** Same-origin JSON call to a Vercel function. Auth rides on the Supabase cookie. */
export async function api<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw new ApiError(data.error ?? `${path} failed (${res.status})`, res.status, typeof data.code === "string" ? data.code : null);
  return data;
}
