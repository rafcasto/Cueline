import type { CSSProperties, ReactNode } from "react";
import { ButtonLink, Logo, cx } from "@/components/ui";
import { brandVars, normalizeBranding } from "@/lib/branding";
import type { RoomBranding } from "@/lib/supabase/types";

/**
 * Applies a room's accent to everything inside: the `--brand*` variables are overridden on
 * this element, so every brand utility in the subtree (buttons, badges, selected options,
 * result bars, focus rings) takes the room's colour. Without an accent it is a plain div.
 */
export function BrandScope({ branding, className, children }: { branding: RoomBranding; className?: string; children: ReactNode }) {
  const vars = brandVars(normalizeBranding(branding));
  return (
    <div className={className} style={vars as CSSProperties | undefined}>
      {children}
    </div>
  );
}

/**
 * The room's logo where the product mark would go; the product mark when there is none.
 * `className` sets the size (height and max width); the default is the header size. The
 * width follows the image's own proportions and is never clipped, so a wide wordmark (the
 * shape the branding editor asks for) and a square mark both fit the box they are given.
 */
export function RoomMark({ branding, name, className = "h-8 max-w-40" }: { branding: RoomBranding; name: string; className?: string }) {
  const b = normalizeBranding(branding);
  if (!b.logo_url) return <Logo wordmark={false} className={className} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={b.logo_url} alt={name} className={cx("w-auto object-contain object-left", className)} />;
}

/** The room's standing call to action, in the accent, opening in a new tab. Null when the host set none. */
export function RoomCtaButton({ branding, size = "sm", className }: { branding: RoomBranding; size?: "sm" | "md" | "lg"; className?: string }) {
  const cta = normalizeBranding(branding).cta;
  if (!cta) return null;
  return (
    <ButtonLink href={cta.url} external size={size} className={className}>
      {cta.label}
      <span aria-hidden className="-mr-0.5 opacity-70">
        ↗
      </span>
    </ButtonLink>
  );
}
