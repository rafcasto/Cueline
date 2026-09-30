"use client";
import { useEffect, useRef, useState } from "react";
import { loadPdf } from "@/lib/pdf";

type Props = { url: string | null; pageIndex: number; className?: string };

/** Renders one page of a PDF to a canvas, sized to its container width. */
export function PdfPage({ url, pageIndex, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      try {
        const doc = await loadPdf(url);
        const page = await doc.getPage(Math.min(doc.numPages, Math.max(1, pageIndex + 1)));
        if (cancelled) return;
        const width = canvas.parentElement?.clientWidth || 960;
        const base = page.getViewport({ scale: 1 });
        const scale = (width / base.width) * (window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const t = page.render({ canvasContext: ctx, canvas, viewport });
        task = t;
        await t.promise;
        setError(null);
      } catch (err) {
        if (!cancelled && (err as Error).name !== "RenderingCancelledException") setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [url, pageIndex]);

  if (!url) return <div className={`flex items-center justify-center bg-neutral-900 text-neutral-400 ${className ?? ""}`}>No deck</div>;
  return (
    <div className={`relative bg-black ${className ?? ""}`}>
      <canvas ref={canvasRef} className="block w-full" />
      {error && <p className="absolute inset-x-0 bottom-0 bg-red-700/80 p-1 text-center text-xs text-white">{error}</p>}
    </div>
  );
}
