"use client";
import { useEffect, useState } from "react";
import { PdfPage } from "@/components/PdfPage";
import { Button, Card, CardHeader, Select, buttonClass } from "@/components/ui";
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
    <Card>
      <CardHeader
        title="Deck"
        description={selected ? "Arrow keys step through it; participants follow once you are live." : "Upload a PDF and present it page by page."}
        actions={
          <>
            <Select value={selected?.id ?? ""} onChange={(e) => onSelect(presentations.find((p) => p.id === e.target.value) ?? null)} className="h-8 w-auto max-w-56 text-sm" aria-label="Deck">
              <option value="">No deck</option>
              {presentations.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.page_count}p
                </option>
              ))}
            </Select>
            <label className={buttonClass("secondary", "sm", busy ? "pointer-events-none opacity-50" : undefined)}>
              {busy ? "Uploading…" : "Upload PDF"}
              <input type="file" accept="application/pdf" className="sr-only" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
          </>
        }
      />
      {msg && <p className="mt-3 text-sm text-ink-muted">{msg}</p>}
      <div className="mt-6">
        <PdfPage url={url} pageIndex={page} className="aspect-video overflow-hidden rounded-lg border border-line bg-black" />
        {selected && (
          <div className="mt-4 flex items-center justify-between">
            <Button variant="secondary" size="sm" onClick={() => void go(page - 1)} disabled={page === 0}>
              ← Previous
            </Button>
            <span className="text-sm tabular-nums text-ink-muted">
              Page <span className="font-medium text-ink">{page + 1}</span> of {selected.page_count}
              {participantsPage !== null && participantsPage !== page && <span className="ml-2 text-amber-600 dark:text-amber-400">(participants on {participantsPage + 1})</span>}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void go(page + 1)} disabled={page >= selected.page_count - 1}>
              Next →
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
