"use client";
import { useState } from "react";
import { CoverPicker } from "@/components/CoverPicker";
import { BrandScope, RoomCover, RoomMark } from "@/components/RoomBrand";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, buttonClass, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { DEFAULT_ACCENT, defaultCoverFor, normalizeBranding, normalizeHex, parseBranding, showsRoomName } from "@/lib/branding";
import { uploadToBucket } from "@/lib/storage";
import type { Room, RoomBranding } from "@/lib/supabase/types";
import { MEDIA_PICKER_ACCEPT, checkMediaFile, fileLabel, formatBytes } from "@/lib/waiting-room";

type Draft = { accent: string; logo_url: string; hideName: boolean; cover_url: string };

function toDraft(b: RoomBranding): Draft {
  const n = normalizeBranding(b);
  return { accent: n.accent ?? DEFAULT_ACCENT, logo_url: n.logo_url ?? "", hideName: !!n.hide_name, cover_url: n.cover_url ?? "" };
}
function toBranding(d: Draft): RoomBranding {
  return { accent: d.accent, logo_url: d.logo_url, hide_name: d.hideName, cover_url: d.cover_url };
}

/**
 * The room's look for attendees: an accent colour that recolours every button, badge and
 * selected answer in the room and on the invite page, a logo in place of the product mark,
 * a cover picture across the room's card on Explore and the top of its public page (one of
 * the default photographs or an upload; there is always one), and up to three standing calls to action (a group of buttons in the room header and under the stage). The
 * preview is the real components under the same variables, so what the host sees is what
 * attendees get.
 */
export function RoomBrandingEditor({ room, onSaved }: { room: Room; onSaved: (room: Room) => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(room.branding));
  const [hexText, setHexText] = useState(draft.accent);
  const [busy, setBusy] = useState<"logo" | "save" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const savedDraft = toDraft(room.branding);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const preview = normalizeBranding(toBranding(draft));
  const setAccent = (value: string) => {
    setHexText(value);
    const hex = normalizeHex(value);
    if (hex) setDraft((d) => ({ ...d, accent: hex }));
  };

  const uploadLogo = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const check = checkMediaFile("image", file);
    if ("error" in check) {
      setMsg({ tone: "error", text: check.error });
      return;
    }
    setBusy("logo");
    setMsg(null);
    try {
      const { url } = await uploadToBucket("media", room.org_id, file, check.contentType);
      setDraft((d) => ({ ...d, logo_url: url }));
      setMsg({ tone: "ok", text: `${file.name} (${formatBytes(file.size)}) uploaded. Save to publish it.` });
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const parsed = parseBranding(toBranding(draft));
    if ("error" in parsed) {
      setMsg({ tone: "error", text: parsed.error });
      return;
    }
    setBusy("save");
    setMsg(null);
    try {
      const r = await api<{ room: Room }>("/api/rooms", { action: "update", id: room.id, branding: parsed.branding });
      onSaved(r.room);
      const next = toDraft(r.room.branding);
      setDraft(next);
      setHexText(next.accent);
      setMsg({ tone: "ok", text: "Branding saved. Attendees get it the next time the room loads." });
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader title="Branding" description="Your colour, your logo and a cover picture, on Explore, the invite page and in the room." />

      <BrandScope branding={preview} className="mt-6 overflow-hidden rounded-xl border border-line">
        <RoomCover branding={preview} name={room.name} className="h-28" />
        <div className="flex h-14 items-center justify-between gap-4 border-b border-line bg-surface-raised px-4">
          <div className="flex min-w-0 items-center gap-3">
            <RoomMark branding={preview} name={room.name} />
            <span className={cx("truncate text-base font-semibold text-ink", !showsRoomName(preview) && "sr-only")}>{room.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone="brand" dot>
              12 here
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-surface-sunken px-4 py-4">
          <Button size="sm">Vote</Button>
          <Button size="sm" variant="secondary">
            Raise hand
          </Button>
          <span className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-contrast">A chosen answer</span>
          <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-surface-inset">
            <div className="h-2 w-2/3 rounded-full bg-brand" />
          </div>
        </div>
      </BrandScope>

      <div className="mt-6 max-w-xl">
        <div className="space-y-4">
          <Field label="Accent colour" htmlFor="brand-accent" hint="Buttons, badges, the chosen answer and the result bars. Text on it flips to dark automatically for light colours.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={draft.accent}
                onChange={(e) => setAccent(e.target.value)}
                className="size-10 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-surface-raised p-1"
                aria-label="Pick a colour"
              />
              <Input id="brand-accent" value={hexText} onChange={(e) => setAccent(e.target.value)} onBlur={() => setHexText(draft.accent)} maxLength={7} spellCheck={false} className="font-mono" />
              <Button variant="ghost" size="sm" disabled={draft.accent === DEFAULT_ACCENT} onClick={() => setAccent(DEFAULT_ACCENT)}>
                Reset
              </Button>
            </div>
          </Field>

          <div>
            <p className="text-sm font-medium text-ink">Logo</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 flex-1 truncate text-sm text-ink-muted" title={draft.logo_url ? fileLabel(draft.logo_url) : undefined}>
                {draft.logo_url ? fileLabel(draft.logo_url) : "PNG, JPEG, WebP or GIF. Shown 32 px tall, so a wide mark with a transparent background works best."}
              </p>
              <label className={buttonClass("secondary", "sm", busy ? "pointer-events-none opacity-50" : undefined)}>
                {busy === "logo" ? "Uploading…" : draft.logo_url ? "Replace" : "Upload"}
                <input type="file" accept={MEDIA_PICKER_ACCEPT.image} className="sr-only" disabled={!!busy} onChange={(e) => void uploadLogo(e.target)} />
              </label>
              {draft.logo_url && (
                <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => setDraft((d) => ({ ...d, logo_url: "" }))}>
                  Remove
                </Button>
              )}
            </div>
            {draft.logo_url && (
              <label className="mt-2 flex items-start gap-2 text-sm text-ink-muted">
                <input type="checkbox" checked={draft.hideName} onChange={(e) => setDraft((d) => ({ ...d, hideName: e.target.checked }))} className="mt-0.5 size-4 shrink-0 rounded border-line-strong accent-brand" />
                <span>
                  <span className="font-medium text-ink">Show the logo on its own</span> — leave the room&apos;s name out of the room header and the invite page when the logo already says it.
                </span>
              </label>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-ink">Cover picture</p>
            <p className="mt-1 text-sm text-ink-muted">Across your card on Explore and the top of your room&apos;s page. One of ours, or a wide photo of your own, about 2:1, of real people in your room.</p>
            <CoverPicker className="mt-3" value={draft.cover_url || defaultCoverFor(room.name)} orgId={room.org_id} disabled={!!busy} onChange={(url) => setDraft((d) => ({ ...d, cover_url: url }))} />
          </div>
        </div>

      </div>

      {msg && (
        <Alert tone={msg.tone === "error" ? "danger" : "success"} className="mt-6">
          {msg.text}
        </Alert>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button onClick={() => void save()} loading={busy === "save"} disabled={(busy !== null && busy !== "save") || !dirty}>
          Save branding
        </Button>
        {dirty && !msg && <span className={cx("text-sm text-warning-ink")}>Unsaved changes.</span>}
      </div>
    </Card>
  );
}
