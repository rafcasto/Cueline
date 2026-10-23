"use client";
import { useRef, useState } from "react";
import { WaitingRoom, elementStyle } from "@/components/WaitingRoom";
import { Button, Card, CardHeader, Field, Select, Switch, Textarea, buttonClass, cx } from "@/components/ui";
import { uploadToBucket } from "@/lib/storage";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Room, WaitingRoom as WaitingRoomConfig, WaitingRoomElement } from "@/lib/supabase/types";
import { DEFAULT_VOLUME, MEDIA_PICKER_ACCEPT, checkMediaFile, fileLabel, formatBytes, normalizeWaitingRoom, soundSource, type MediaKind } from "@/lib/waiting-room";

type Busy = MediaKind | "save" | null;

/**
 * Slide-like editor for the waiting room: pick a picture or a video for the backdrop, add
 * music (or let the video's own sound through), add text boxes, drag them around a 16:9
 * canvas, preview it with sound, and save.
 */
export function WaitingRoomEditor({ room, onSaved }: { room: Room; onSaved: (cfg: WaitingRoomConfig) => void }) {
  const [saved, setSaved] = useState<WaitingRoomConfig>(() => normalizeWaitingRoom(room.waiting_room));
  const [cfg, setCfg] = useState<WaitingRoomConfig>(saved);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const setBg = (patch: Partial<WaitingRoomConfig["background"]>) => setCfg((c) => ({ ...c, background: { ...c.background, ...patch } }));
  const update = (id: string, patch: Partial<WaitingRoomElement>) =>
    setCfg((c) => ({ ...c, elements: c.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  const addText = () => {
    const el: WaitingRoomElement = {
      id: crypto.randomUUID(),
      type: "text",
      x: 10,
      y: 40,
      w: 80,
      h: 20,
      text: "Welcome! We start shortly.",
      fontSize: 8,
      color: "#ffffff",
      align: "center",
      weight: "bold",
    };
    setCfg((c) => ({ ...c, elements: [...c.elements, el] }));
    setSelected(el.id);
  };

  const upload = async (kind: MediaKind, input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ""; // so picking the same file again still fires onChange
    if (!file) return;
    const check = checkMediaFile(kind, file);
    if ("error" in check) {
      setMsg({ tone: "error", text: check.error });
      return;
    }
    setBusy(kind);
    setMsg(null);
    try {
      const { url } = await uploadToBucket("media", room.org_id, file, check.contentType);
      setBg({ [`${kind}_url`]: url });
      setMsg({ tone: "ok", text: `${file.name} (${formatBytes(file.size)}) uploaded. Save to publish it.` });
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const onPointerDown = (e: React.PointerEvent, el: WaitingRoomElement) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    drag.current = { id: el.id, dx: ((e.clientX - rect.left) / rect.width) * 100 - el.x, dy: ((e.clientY - rect.top) / rect.height) * 100 - el.y };
    setSelected(el.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100 - drag.current.dx));
    const y = Math.max(0, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100 - drag.current.dy));
    update(drag.current.id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  };
  const onPointerUp = () => (drag.current = null);

  const save = async () => {
    setBusy("save");
    setMsg(null);
    const next = normalizeWaitingRoom(cfg);
    const { error } = await supabaseBrowser().from("rooms").update({ waiting_room: next }).eq("id", room.id);
    setBusy(null);
    if (error) {
      setMsg({ tone: "error", text: error.message });
      return;
    }
    setSaved(next);
    setCfg(next);
    setMsg({ tone: "ok", text: "Waiting room saved. Attendees get it the next time the room loads." });
    onSaved(next);
  };

  const sel = cfg.elements.find((e) => e.id === selected);
  const bg = cfg.background;
  const source = soundSource(bg);
  const volume = bg.volume ?? DEFAULT_VOLUME;
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  const empty = !bg.image_url && !bg.video_url && cfg.elements.length === 0;

  const mediaRow = (kind: MediaKind, label: string, hint: string, url: string | undefined) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="truncate text-sm text-ink-muted" title={url ? fileLabel(url) : undefined}>
          {url ? fileLabel(url) : hint}
        </p>
      </div>
      <label className={buttonClass("secondary", "sm", busy ? "pointer-events-none opacity-50" : undefined)}>
        {busy === kind ? "Uploading…" : url ? "Replace" : "Upload"}
        <input type="file" accept={MEDIA_PICKER_ACCEPT[kind]} className="sr-only" disabled={!!busy} onChange={(e) => void upload(kind, e.target)} />
      </label>
      {url && (
        <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => setBg({ [`${kind}_url`]: undefined })}>
          Remove
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div ref={canvasRef} className="cq relative overflow-hidden rounded-xl shadow-card" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <WaitingRoom config={{ ...cfg, elements: [] }} withSound autoplaySound={false} />
        {empty && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/60">
            Upload a picture or a video below. Attendees see this canvas from the moment you open the room until you go live.
          </p>
        )}
        {cfg.elements.map((el) => (
          <div
            key={el.id}
            onPointerDown={(e) => onPointerDown(e, el)}
            className={cx("absolute flex cursor-move items-center whitespace-pre-wrap break-words rounded", selected === el.id ? "ring-2 ring-indigo-400" : "ring-1 ring-white/30")}
            style={elementStyle(el)}
          >
            <span className="w-full">{el.text}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Backdrop" description="A picture, or a video that loops." />
          <div className="mt-4 space-y-4">
            <Field label="Type" htmlFor="wr-bg-type">
              <Select id="wr-bg-type" value={bg.type === "video" ? "video" : "image"} onChange={(e) => setBg({ type: e.target.value as "image" | "video" })}>
                <option value="image">Picture</option>
                <option value="video">Video</option>
              </Select>
            </Field>
            {bg.type === "video" ? (
              <>
                {mediaRow("video", "Video", "MP4 or WebM, up to 100 MB. Keep it short; it loops.", bg.video_url)}
                <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface-inset px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">Play the video’s own sound</p>
                    <p className="text-sm text-ink-muted">Instead of a music track.</p>
                  </div>
                  <Switch checked={!!bg.video_sound} onChange={(v) => setBg({ video_sound: v })} label="Play the video’s own sound" disabled={!bg.video_url} />
                </div>
              </>
            ) : (
              mediaRow("image", "Picture", "PNG, JPEG, WebP or GIF. 16:9 fills the canvas without cropping.", bg.image_url)
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Music" description="Loops while attendees wait and stops the moment you go live." />
          <div className="mt-4 space-y-4">
            {mediaRow("audio", "Track", "MP3, M4A, OGG or WAV, up to 100 MB.", bg.audio_url)}
            {source && (
              <label className="block text-sm">
                <span className="flex items-center justify-between font-medium text-ink">
                  <span>Volume</span>
                  <span className="tabular-nums text-ink-muted">{Math.round(volume * 100)}%</span>
                </span>
                <input type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={(e) => setBg({ volume: Number(e.target.value) / 100 })} className="mt-1.5 w-full accent-brand" />
              </label>
            )}
            <p className="text-sm text-ink-muted">
              {source === "video"
                ? "The video’s own sound plays; the track is ignored while that switch is on. Use the speaker in the corner of the canvas to hear it."
                : source === "track"
                  ? "Browsers hold sound back until the page has had a tap. Attendees who come through the invite page hear it straight away; anyone who lands cold gets a “Tap for sound” button, and everyone can mute it. Use the speaker in the corner of the canvas to preview."
                  : "No sound yet. Upload a track, or switch on the video’s own sound."}
            </p>
          </div>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader title="Text" description="Drag a box on the canvas to place it." actions={<Button variant="secondary" size="sm" onClick={addText}>+ Add text</Button>} />
          {sel ? (
            <div className="mt-4 space-y-4">
              <Textarea value={sel.text} onChange={(e) => update(sel.id, { text: e.target.value })} rows={2} aria-label="Text" />
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm">
                  <span className="font-medium text-ink">Size</span>
                  <input type="range" min={3} max={20} value={sel.fontSize} onChange={(e) => update(sel.id, { fontSize: Number(e.target.value) })} className="mt-1.5 w-full accent-brand" />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-ink">Width</span>
                  <input type="range" min={10} max={100} value={sel.w} onChange={(e) => update(sel.id, { w: Number(e.target.value) })} className="mt-1.5 w-full accent-brand" />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="color" value={sel.color} onChange={(e) => update(sel.id, { color: e.target.value })} className="size-10 cursor-pointer rounded-lg border border-line-strong bg-surface-raised p-1" aria-label="Colour" />
                <Select value={sel.align} onChange={(e) => update(sel.id, { align: e.target.value as WaitingRoomElement["align"] })} className="w-auto" aria-label="Alignment">
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </Select>
                <Button variant={sel.weight === "bold" ? "primary" : "secondary"} size="md" className="w-10 px-0 font-bold" aria-pressed={sel.weight === "bold"} aria-label="Bold" onClick={() => update(sel.id, { weight: sel.weight === "bold" ? "normal" : "bold" })}>
                  B
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  className="ml-auto text-red-600 hover:text-red-700 dark:text-red-400"
                  onClick={() => {
                    setCfg((c) => ({ ...c, elements: c.elements.filter((e) => e.id !== sel.id) }));
                    setSelected(null);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-muted">{cfg.elements.length === 0 ? "No text boxes yet." : "Select a text box on the canvas to edit it."}</p>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => void save()} loading={busy === "save"} disabled={busy !== null && busy !== "save"}>
          Save waiting room
        </Button>
        {msg ? (
          <span className={cx("text-sm", msg.tone === "error" ? "text-red-600 dark:text-red-400" : "text-ink-muted")} role={msg.tone === "error" ? "alert" : "status"}>
            {msg.text}
          </span>
        ) : dirty ? (
          <span className="text-sm text-amber-600 dark:text-amber-400">Unsaved changes.</span>
        ) : null}
      </div>
    </div>
  );
}
