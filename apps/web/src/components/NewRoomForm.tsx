"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TopicPicker } from "@/components/TopicPicker";
import { Alert, Button, ButtonLink, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import type { Room } from "@/lib/supabase/types";

/** An organisation the host can create rooms in, and how many it has left (null: no limit, for platform admins). */
export type RoomOrg = { id: string; name: string; roomsLeft: number | null };

/**
 * Create a room from the host index. A room is a standing space (deck, activities, waiting
 * room, email sequence) that any number of events run in; the new room opens straight away.
 * The host says what it is about on the way in, the way a Meetup group picks its categories,
 * so the room lands under the right filters on Explore from day one. Every plan includes one
 * room; when the organisation has used its allowance the form gives way to the billing page.
 */
export function NewRoomForm({ orgs, autoOpen }: { orgs: RoomOrg[]; autoOpen?: boolean }) {
  const router = useRouter();
  const canCreate = orgs.filter((o) => o.roomsLeft === null || o.roomsLeft > 0);
  const [open, setOpen] = useState(!!autoOpen && canCreate.length > 0);
  const [name, setName] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [orgId, setOrgId] = useState(canCreate[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { room } = await api<{ room: Room }>("/api/rooms", { action: "create", org_id: orgId, name, topics });
      router.push(`/host/${room.slug}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (canCreate.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-muted">Your plan&apos;s rooms are all in use.</span>
        <ButtonLink href="/host/billing#rooms" variant="secondary">
          Buy another room
        </ButtonLink>
      </div>
    );
  }
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} disabled={orgs.length === 0}>
        New room
      </Button>
    );
  }
  const chosen = canCreate.find((o) => o.id === orgId) ?? canCreate[0];
  return (
    <form onSubmit={(e) => void submit(e)} className="w-full space-y-5 rounded-xl border border-line bg-surface-inset p-5 sm:max-w-xl">
      <h2 className="text-sm font-semibold text-ink">New room</h2>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Room name" htmlFor="room-name" hint="Shown to attendees. The address under /r/ comes from it; you can change both later in the room's settings.">
        <Input id="room-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus placeholder="Product webinars" />
      </Field>
      <Field label="What is it about?" hint="Pick the topics that fit, or add your own. People browsing Explore filter by them; you can change them later in Settings.">
        <TopicPicker value={topics} onChange={setTopics} compact />
      </Field>
      {canCreate.length > 1 && (
        <Field label="Organisation" htmlFor="room-org">
          <Select id="room-org" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {canCreate.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.roomsLeft !== null ? ` (${o.roomsLeft} ${o.roomsLeft === 1 ? "room" : "rooms"} left)` : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={busy} disabled={!name.trim()}>
          Create room
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        {chosen && chosen.roomsLeft !== null && <span className="text-xs text-ink-muted">{chosen.roomsLeft === 1 ? "This uses the last room on your plan." : `${chosen.roomsLeft} rooms left on your plan.`}</span>}
      </div>
    </form>
  );
}
