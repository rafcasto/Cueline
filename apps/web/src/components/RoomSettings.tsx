"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import type { Room } from "@/lib/supabase/types";

/** Name and address of the room, and the way to delete it. */
export function RoomSettings({ room, hasOpenSession, onSaved }: { room: Room; hasOpenSession: boolean; onSaved: (room: Room) => void }) {
  const router = useRouter();
  const [name, setName] = useState(room.name);
  const [slug, setSlug] = useState(room.slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = name.trim() !== room.name || slug.trim() !== room.slug;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await api<{ room: Room }>("/api/rooms", { action: "update", id: room.id, name, slug });
      onSaved(r.room);
      setSaved(true);
      if (r.room.slug !== room.slug) router.replace(`/host/${r.room.slug}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${room.name}"? Its events, registrations, deck, activities, waiting room and email sequence are removed and scheduled reminders are cancelled. This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/rooms", { action: "delete", id: room.id });
      router.push("/host");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Room" description="Each room has its own events, deck, activities, waiting room and email sequence." />
        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}
        {saved && !error && (
          <Alert tone="success" className="mt-4">
            Saved.
          </Alert>
        )}
        <form onSubmit={(e) => void save(e)} className="mt-6 max-w-md space-y-4">
          <Field label="Name" htmlFor="room-name" hint="Shown to attendees and used as the default event title.">
            <Input id="room-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </Field>
          <Field label="Address" htmlFor="room-slug" hint="Lowercase letters, digits and hyphens. Invite links and personal links keep working after a change; only /r/ bookmarks break.">
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-muted">/r/</span>
              <Input id="room-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={40} pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" required className="font-mono text-sm" />
            </div>
          </Field>
          <Button type="submit" loading={busy} disabled={!dirty || !name.trim()}>
            Save
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Delete this room" description={hasOpenSession ? "End the session first; a room with the doors open cannot be deleted." : "Removes everything in the room and cancels the reminders still scheduled for its registrants."} />
        <Button variant="danger" className="mt-4" onClick={() => void remove()} disabled={busy || hasOpenSession}>
          Delete room
        </Button>
      </Card>
    </div>
  );
}
