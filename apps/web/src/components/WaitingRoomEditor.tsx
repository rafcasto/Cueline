"use client";
import { useRef, useState } from "react";
import { WaitingRoom } from "@/components/WaitingRoom";
import { Button, Card, CardHeader, Field, Select, Textarea, buttonClass, cx } from "@/components/ui";
import { uploadToBucket } from "@/lib/storage";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Room, WaitingRoom as WaitingRoomConfig, WaitingRoomElement } from "@/lib/supabase/types";

/**
 * Slide-like editor for the waiting room: pick a background (image, video, or
 * image + audio), add text boxes, drag them around a 16:9 canvas, and save.
 */
export function WaitingRoomEditor({ room, onSaved }: { room: Room; onSaved: (cfg: WaitingRoomConfig) => void }) {
  const [cfg, setCfg] = useState<WaitingRoomConfig>(room.waiting_room);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
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

  const upload = async (kind: "image" | "video" | "audio", file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadToBucket("media", room.org_id, file);
      setBg({ [`${kind}_url`]: url });
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
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
    setBusy(true);
    const { error } = await supabaseBrowser().from("rooms").update({ waiting_room: cfg }).eq("id", room.id);
    setBusy(false);
    setMsg(error ? error.message : "Waiting room saved.");
    if (!error) onSaved(cfg);
  };

  const sel = cfg.elements.find((e) => e.id === selected);
  const bg = cfg.background;
  const fileButton = (kind: "image" | "video" | "audio", accept: string, present: boolean) => (
    <label className={buttonClass("secondary", "sm", busy ? "pointer-events-none opacity-50" : undefined)}>
      {busy ? "Uploading…" : present ? `Replace ${kind}` : `Upload ${kind}`}
      <input type="file" accept={accept} className="sr-only" disabled={busy} onChange={(e) => void upload(kind, e.target.files?.[0])} />
    </label>
  );

  return (
    <div className="space-y-6">
      <div ref={canvasRef} className="cq relative overflow-hidden rounded-xl shadow-card" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <WaitingRoom config={{ ...cfg, elements: [] }} />
        {cfg.elements.map((el) => (
          <div
            key={el.id}
            onPointerDown={(e) => onPointerDown(e, el)}
            className={cx("absolute flex cursor-move items-center whitespace-pre-wrap break-words rounded", selected === el.id ? "ring-2 ring-indigo-400" : "ring-1 ring-white/30")}
            style={{
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.w}%`,
              height: `${el.h}%`,
              fontSize: `${el.fontSize}cqh`,
              color: el.color,
              textAlign: el.align,
              fontWeight: el.weight,
              justifyContent: el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start",
              textShadow: "0 1px 3px rgba(0,0,0,.5)",
            }}
          >
            <span className="w-full">{el.text}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Background" description="An image, a looping video, or an image with audio behind it." />
          <div className="mt-4 space-y-4">
            <Field label="Type" htmlFor="wr-bg-type">
              <Select id="wr-bg-type" value={bg.type} onChange={(e) => setBg({ type: e.target.value as WaitingRoomConfig["background"]["type"] })}>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="image_audio">Image + audio</option>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              {bg.type !== "video" && fileButton("image", "image/*", !!bg.image_url)}
              {bg.type === "video" && fileButton("video", "video/mp4,video/webm", !!bg.video_url)}
              {bg.type === "image_audio" && fileButton("audio", "audio/*", !!bg.audio_url)}
            </div>
          </div>
        </Card>

        <Card>
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

      <div className="flex items-center gap-4">
        <Button onClick={() => void save()} loading={busy}>
          Save waiting room
        </Button>
        {msg && <span className="text-sm text-ink-muted">{msg}</span>}
      </div>
    </div>
  );
}
