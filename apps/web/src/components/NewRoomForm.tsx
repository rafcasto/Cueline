"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import type { Room } from "@/lib/supabase/types";

type Org = { id: string; name: string };

/**
 * Create a room from the host index. A room is a standing space (deck, activities, waiting
 * room, email sequence) that any number of events run in; the new room opens straight away.
 */
export function NewRoomForm({ orgs, autoOpen }: { orgs: Org[]; autoOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!!autoOpen);
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { room } = await api<{ room: Room }>("/api/rooms", { action: "create", org_id: orgId, name });
      router.push(`/host/${room.slug}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} disabled={orgs.length === 0}>
        New room
      </Button>
    );
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="w-full space-y-4 rounded-xl border border-line bg-surface-inset p-5 sm:max-w-md">
      <h2 className="text-sm font-semibold text-ink">New room</h2>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Room name" htmlFor="room-name" hint="Shown to attendees. The address under /r/ comes from it; you can change both later in the room's settings.">
        <Input id="room-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus placeholder="Product webinars" />
      </Field>
      {orgs.length > 1 && (
        <Field label="Organisation" htmlFor="room-org">
          <Select id="room-org" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={!name.trim()}>
          Create room
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
