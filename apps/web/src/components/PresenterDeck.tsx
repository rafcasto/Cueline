"use client";
import { useEffect, useState } from "react";
import { PdfPage } from "@/components/PdfPage";
import { countPages } from "@/lib/pdf";
import { publicUrl, uploadToBucket } from "@/lib/storage";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Presentation, Room } from "@/lib/supabase/types";

type Props = {
  room: Room;
  presentations: Presentation[];
  onPresentationsChange: (list: Presentation[]) => void;
  selected: Presentation | null;
  onSelect: (p: Presentation | null) => void;
  /** The presenter's current page (controlled by the host panel). */
  page: number;
  /** Live: the page participants currently see, for the "participants on N" hint. */
  participantsPage: number | null;
  onNavigate: (pageIndex: number) => Promise<void>;
};

/** Upload a PDF deck and step through it; every navigation is a slide_events row for participants. */
export function PresenterDeck({ room, presentations, onPresentationsChange, selected, onSelect, page, participantsPage, onNavigate }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const [pages, { path }] = await Promise.all([countPages(file), uploadToBucket("presentations", room.org_id, file)]);
      const { data, error } = await supabaseBrowser()
        .from("presentations")
        .insert({ org_id: room.org_id, room_id: room.id, name: file.name.replace(/\.pdf$/i, ""), storage_path: path, page_count: pages })
        .select("*")
        .single();
      if (error) throw error;
      const p = data as Presentation;
      onPresentationsChange([p, ...presentations]);
      onSelect(p);
      setMsg(`Uploaded ${p.name} (${pages} pages)`);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const go = async (i: number) => {
    if (!selected) return;
    await onNavigate(Math.max(0, Math.min(selected.page_count - 1, i)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") void go(page + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") void go(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const url = selected ? publicUrl("presentations", selected.storage_path) : null;

  return (
    <div className="rounded-lg border p-4 dark:border-neutral-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Deck</h2>
        <div className="flex items-center gap-2 text-sm">
          <select value={selected?.id ?? ""} onChange={(e) => onSelect(presentations.find((p) => p.id === e.target.value) ?? null)} className="rounded border px-2 py-1 dark:bg-neutral-800">
            <option value="">No deck</option>
            {presentations.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.page_count}p</option>)}
          </select>
          <label className="cursor-pointer rounded border px-2 py-1">
            {busy ? "Uploading…" : "Upload PDF"}
            <input type="file" accept="application/pdf" className="hidden" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
        </div>
      </div>
      {msg && <p className="mt-2 text-xs text-neutral-500">{msg}</p>}
      <div className="mt-3">
        <PdfPage url={url} pageIndex={page} className="aspect-video overflow-hidden rounded-lg" />
        {selected && (
          <div className="mt-2 flex items-center justify-between text-sm">
            <button onClick={() => void go(page - 1)} disabled={page === 0} className="rounded border px-3 py-1 disabled:opacity-40">← Prev</button>
            <span className="tabular-nums text-neutral-500">
              Page {page + 1} / {selected.page_count}
              {participantsPage !== null && participantsPage !== page && <span className="ml-2 text-amber-600">(participants on {participantsPage + 1})</span>}
            </span>
            <button onClick={() => void go(page + 1)} disabled={page >= selected.page_count - 1} className="rounded border px-3 py-1 disabled:opacity-40">Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
