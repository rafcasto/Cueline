"use client";
import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { formatStart } from "@/components/RegisterForm";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Invite, Participant, Registration, Room } from "@/lib/supabase/types";

type Props = {
  room: Room;
  userId: string;
  invites: Invite[];
  registrations: Registration[];
  /** Who is in the open session, to mark which registrants have actually joined. */
  participants: Record<string, Participant>;
  onInvitesChange: (invites: Invite[]) => void;
  onRegistrationsChange: (registrations: Registration[]) => void;
};

/**
 * Organiser side of invite links: create one, copy it, watch registrations arrive, revoke it.
 * The two numbers that matter sit at the top: registered, and joined the open session.
 */
export function InviteCard({ room, userId, invites, registrations, participants, onInvitesChange, onRegistrationsChange }: Props) {
  const sb = supabaseBrowser();
  const [title, setTitle] = useState(room.name);
  const [startsAt, setStartsAt] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Absolute link for copying; empty on the server so hydration matches.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const active = invites.filter((i) => !i.revoked_at);
  const revokedCount = invites.length - active.length;

  const refresh = useCallback(async () => {
    const { data } = await sb.from("registrations").select("*").eq("room_id", room.id).order("created_at", { ascending: false });
    if (data) onRegistrationsChange(data as Registration[]);
  }, [sb, room.id, onRegistrationsChange]);

  // Registrations are written by the server, not broadcast; poll gently while this tab is open.
  useEffect(() => {
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await sb
      .from("invites")
      .insert({
        org_id: room.org_id,
        room_id: room.id,
        title: title.trim() || room.name,
        description: description.trim() || null,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        created_by: userId,
      })
      .select("*")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    onInvitesChange([data as Invite, ...invites]);
    setCreating(false);
    setDescription("");
    setStartsAt("");
  };

  const revoke = async (inv: Invite) => {
    if (!confirm("Revoke this link? People who already registered keep their access; nobody new can register with it.")) return;
    const revoked_at = new Date().toISOString();
    const { error } = await sb.from("invites").update({ revoked_at }).eq("id", inv.id);
    if (error) return setError(error.message);
    onInvitesChange(invites.map((i) => (i.id === inv.id ? { ...i, revoked_at } : i)));
  };

  const copy = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      prompt("Copy this link", url);
    }
  };

  const joinedCount = registrations.filter((r) => participants[r.user_id]).length;

  return (
    <section className="space-y-4">
      <div className="rounded-lg border p-4 dark:border-neutral-700">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Invite link</h2>
            <p className="text-sm text-neutral-500">Attendees register with a name and email, then get into the room with the same link.</p>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <div className="text-2xl font-semibold tabular-nums">{registrations.length}</div>
              <div className="text-xs text-neutral-500">registered</div>
            </div>
            <div>
              <div className="text-2xl font-semibold tabular-nums">{joinedCount}</div>
              <div className="text-xs text-neutral-500">joined</div>
            </div>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {active.length === 0 && !creating && (
          <div className="mt-4 rounded-lg bg-neutral-50 p-4 text-sm dark:bg-neutral-800">
            <p>No invite link yet. Without one nobody can get into <code>/r/{room.slug}</code>.</p>
            <button onClick={() => setCreating(true)} className="mt-3 rounded bg-indigo-600 px-3 py-1.5 text-white">Create invite link</button>
          </div>
        )}

        {active.map((inv) => {
          const url = `${origin}/join/${inv.token}`;
          return (
            <div key={inv.id} className="mt-4 rounded-lg border p-3 dark:border-neutral-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{inv.title}</div>
                  <div className="text-xs text-neutral-500">{inv.starts_at ? formatStart(inv.starts_at) : "No start time set"}</div>
                </div>
                <button onClick={() => void revoke(inv)} className="text-xs text-red-700">revoke</button>
              </div>
              <div className="mt-2 flex gap-2">
                <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="flex-1 rounded border bg-neutral-50 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800" />
                <button onClick={() => void copy(url, inv.id)} className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">{copied === inv.id ? "Copied" : "Copy"}</button>
                <a href={url} target="_blank" rel="noreferrer" className="rounded border px-3 py-1 text-sm dark:border-neutral-700">Open</a>
              </div>
            </div>
          );
        })}

        {creating || active.length > 0 ? (
          creating ? (
            <form onSubmit={(e) => void create(e)} className="mt-4 space-y-2 rounded-lg border p-3 dark:border-neutral-700">
              <label className="block text-sm">
                <span className="text-neutral-600 dark:text-neutral-300">Webinar title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required className="mt-1 w-full rounded border px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800" />
              </label>
              <label className="block text-sm">
                <span className="text-neutral-600 dark:text-neutral-300">Starts (optional)</span>
                <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1 w-full rounded border px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800" />
              </label>
              <label className="block text-sm">
                <span className="text-neutral-600 dark:text-neutral-300">What attendees will see (optional)</span>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded border px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800" />
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">Create link</button>
                <button type="button" onClick={() => setCreating(false)} className="rounded border px-3 py-1.5 text-sm dark:border-neutral-700">Cancel</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setCreating(true)} className="mt-3 text-sm text-indigo-700 underline">New link for another event</button>
          )
        ) : null}
        {revokedCount > 0 && <p className="mt-2 text-xs text-neutral-500">{revokedCount} earlier {revokedCount === 1 ? "link" : "links"} revoked.</p>}
      </div>

      <div className="rounded-lg border p-4 dark:border-neutral-700">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Registrations</h2>
          <button onClick={() => void refresh()} className="text-xs text-neutral-500 underline">refresh</button>
        </div>
        {registrations.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nobody has registered yet. Share the link.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1 font-normal">Name</th>
                <th className="py-1 font-normal">Email</th>
                <th className="py-1 font-normal">Registered</th>
                <th className="py-1 font-normal">In room</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((r) => (
                <tr key={r.id} className="border-t dark:border-neutral-800">
                  <td className="py-1 pr-2">{r.name}</td>
                  <td className="py-1 pr-2 text-neutral-600 dark:text-neutral-300">{r.email}</td>
                  <td className="py-1 pr-2 text-xs text-neutral-500">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-1">{participants[r.user_id] ? <span className="rounded bg-green-100 px-1.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-100">yes</span> : <span className="text-xs text-neutral-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
