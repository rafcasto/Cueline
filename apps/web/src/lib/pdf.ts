"use client";
import type { PDFDocumentProxy } from "pdfjs-dist";

let lib: Promise<typeof import("pdfjs-dist")> | null = null;

/** pdf.js is loaded lazily on the client only; the worker is served from the bundle. */
export function pdfjs() {
  if (!lib) {
    lib = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return m;
    });
  }
  return lib;
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();

export function loadPdf(url: string) {
  let d = docs.get(url);
  if (!d) {
    d = pdfjs().then((m) => m.getDocument({ url }).promise);
    docs.set(url, d);
  }
  return d;
}

/** Page count of a local File, used when a deck is uploaded. */
export async function countPages(file: File) {
  const m = await pdfjs();
  const doc = await m.getDocument({ data: await file.arrayBuffer() }).promise;
  const n = doc.numPages;
  await doc.destroy();
  return n;
}
