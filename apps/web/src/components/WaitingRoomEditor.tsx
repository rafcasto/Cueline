"use client";
import { useRef, useState } from "react";
import { WaitingRoom } from "@/components/WaitingRoom";
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

  return (
    <div className="space-y-3">
      <div ref={canvasRef} className="cq relative" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <WaitingRoom config={{ ...cfg, elements: [] }} />
        {cfg.elements.map((el) => (
          <div
            key={el.id}
            onPointerDown={(e) => onPointerDown(e, el)}
            className={`absolute flex cursor-move items-center whitespace-pre-wrap break-words rounded ${selected === el.id ? "ring-2 ring-indigo-400" : "ring-1 ring-white/30"}`}
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

      <div className="grid gap-3 text-sm md:grid-cols-2">
        <fieldset className="space-y-2 rounded-lg border p-3 dark:border-neutral-700">
          <legend className="px-1 font-medium">Background</legend>
          <select value={cfg.background.type} onChange={(e) => setBg({ type: e.target.value as WaitingRoomConfig["background"]["type"] })} className="rounded border px-2 py-1 dark:bg-neutral-800">
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="image_audio">Image + audio</option>
          </select>
          {cfg.background.type !== "video" && (
            <label className="block">Image <input type="file" accept="image/*" disabled={busy} onChange={(e) => void upload("image", e.target.files?.[0])} /></label>
          )}
          {cfg.background.type === "video" && (
            <label className="block">Video <input type="file" accept="video/mp4,video/webm" disabled={busy} onChange={(e) => void upload("video", e.target.files?.[0])} /></label>
          )}
          {cfg.background.type === "image_audio" && (
            <label className="block">Audio <input type="file" accept="audio/*" disabled={busy} onChange={(e) => void upload("audio", e.target.files?.[0])} /></label>
          )}
        </fieldset>

        <fieldset className="space-y-2 rounded-lg border p-3 dark:border-neutral-700">
          <legend className="px-1 font-medium">Text</legend>
          <button onClick={addText} className="rounded border px-2 py-1">+ Add text</button>
          {sel && (
            <div className="space-y-2">
              <textarea value={sel.text} onChange={(e) => update(sel.id, { text: e.target.value })} rows={2} className="w-full rounded border px-2 py-1 dark:bg-neutral-800" />
              <div className="flex flex-wrap items-center gap-2">
                <label>Size <input type="range" min={3} max={20} value={sel.fontSize} onChange={(e) => update(sel.id, { fontSize: Number(e.target.value) })} /></label>
                <label>Width <input type="range" min={10} max={100} value={sel.w} onChange={(e) => update(sel.id, { w: Number(e.target.value) })} /></label>
                <input type="color" value={sel.color} onChange={(e) => update(sel.id, { color: e.target.value })} />
                <select value={sel.align} onChange={(e) => update(sel.id, { align: e.target.value as WaitingRoomElement["align"] })} className="rounded border px-1 dark:bg-neutral-800">
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select>
                <button onClick={() => update(sel.id, { weight: sel.weight === "bold" ? "normal" : "bold" })} className="rounded border px-2 font-bold">B</button>
                <button onClick={() => { setCfg((c) => ({ ...c, elements: c.elements.filter((e) => e.id !== sel.id) })); setSelected(null); }} className="text-red-600">Delete</button>
              </div>
            </div>
          )}
        </fieldset>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => void save()} disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-white disabled:opacity-50">Save waiting room</button>
        {msg && <span className="text-xs text-neutral-500">{msg}</span>}
      </div>
    </div>
  );
}
