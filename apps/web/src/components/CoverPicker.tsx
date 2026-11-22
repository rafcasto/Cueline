"use client";
import { useState } from "react";
import { cx } from "@/components/ui";
import { DEFAULT_COVERS, isDefaultCover } from "@/lib/branding";
import { uploadToBucket } from "@/lib/storage";
import { MEDIA_PICKER_ACCEPT, checkMediaFile, formatBytes } from "@/lib/waiting-room";

/**
 * The cover picture a room wears on its Explore card and at the top of its page: one of the
 * default photographs, or a picture of the host's own. One is always chosen, so a room never
 * shows an empty band. Shared by the new-room form and the branding editor: the parent owns
 * the value, the picker owns the upload (to the org's folder in the media bucket) and keeps
 * the uploaded picture as a fifth tile, so the host can compare it with the defaults and go
 * back to it after trying one.
 */
export function CoverPicker({
  value,
  orgId,
  onChange,
  disabled,
  surface = "raised",
  className,
}: {
  value: string;
  orgId: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  /** What the picker sits on, so the selection ring's gap matches it. */
  surface?: "raised" | "inset";
  className?: string;
}) {
  const [uploaded, setUploaded] = useState<string | null>(value && !isDefaultCover(value) ? value : null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const options = [...DEFAULT_COVERS, ...(uploaded ? [{ url: uploaded, label: "Your own picture" }] : [])];
  const off = disabled || busy;

  const upload = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const check = checkMediaFile("image", file);
    if ("error" in check) {
      setMsg({ tone: "error", text: check.error });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { url } = await uploadToBucket("media", orgId, file, check.contentType);
      setUploaded(url);
      onChange(url);
      setMsg({ tone: "ok", text: `${file.name} (${formatBytes(file.size)}) uploaded.` });
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const offset = surface === "inset" ? "ring-offset-surface-inset" : "ring-offset-surface-raised";

  return (
    <div className={className}>
      <div role="radiogroup" aria-label="Cover picture" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {options.map((o) => {
          const selected = o.url === value;
          return (
            <button
              key={o.url}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={o.label}
              title={o.label}
              disabled={off}
              onClick={() => onChange(o.url)}
              className={cx(
                "relative aspect-[2/1] overflow-hidden rounded-lg bg-surface-inset transition-shadow disabled:cursor-default",
                selected ? cx("ring-2 ring-brand ring-offset-2", offset) : "ring-1 ring-line hover:ring-line-strong",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.url} alt="" className="size-full object-cover" />
              {selected && (
                <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-card" aria-hidden>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-3">
                    <path d="M4 10.5l4 4 8-8" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
        <label
          className={cx(
            "flex aspect-[2/1] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-line-strong px-2 text-center text-sm font-semibold text-brand transition-colors hover:bg-surface-raised/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
            off && "pointer-events-none opacity-50",
          )}
        >
          {busy ? "Uploading…" : uploaded ? "Replace yours" : "Upload your own"}
          <span className="text-xs font-normal text-ink-muted">PNG, JPEG, WebP or GIF</span>
          <input type="file" accept={MEDIA_PICKER_ACCEPT.image} className="sr-only" disabled={off} onChange={(e) => void upload(e.target)} />
        </label>
      </div>
      {msg && <p className={cx("mt-2 text-sm", msg.tone === "error" ? "text-error" : "text-ink-muted")}>{msg.text}</p>}
    </div>
  );
}
