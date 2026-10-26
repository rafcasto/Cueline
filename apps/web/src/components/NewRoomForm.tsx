"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TopicPicker } from "@/components/TopicPicker";
import { Alert, Button, ButtonLink, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import type { Room } from "@/lib/supabase/types";

/** An organisation the host can create rooms in, and why it can or cannot right now. */
export type RoomOrg = { id: string; name: string; rooms: number; canCreateFree: boolean; canBuy: boolean };

/**
 * Create a room from the host index. A room is a standing space (deck, activities, waiting
 * room, email sequence) that any number of events run in; the new room opens straight away.
 * The host says what it is about on the way in, the way a Meetup group picks its categories,
 * so the room lands under the right filters on Explore from day one. An organisation's first
 * room is free; after that a room is bought on Starter or Pro from the billing page, and a
 * free room must be upgraded before another can be added.
 */
export function NewRoomForm({ orgs, autoOpen }: { orgs: RoomOrg[]; autoOpen?: boolean }) {
  const router = useRouter();
  const free = orgs.filter((o) => o.canCreateFree);
  const [open, setOpen] = useState(!!autoOpen && free.length > 0);
  const [name, setName] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [orgId, setOrgId] = useState(free[0]?.id ?? "");
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

  if (free.length === 0) {
    const buyable = orgs.some((o) => o.canBuy);
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-muted">{buyable ? "Another room is a Starter or Pro subscription." : "Upgrade your room before adding another."}</span>
        <ButtonLink href="/host/billing#rooms" variant="secondary">
          {buyable ? "Add a room" : "Upgrade on Billing"}
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
      {free.length > 1 && (
        <Field label="Organisation" htmlFor="room-org">
          <Select id="room-org" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {free.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
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
        <span className="text-xs text-ink-muted">Your first room is free. Upgrade it any time from Billing.</span>
      </div>
    </form>
  );
}
