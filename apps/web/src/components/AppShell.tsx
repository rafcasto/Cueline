import Link from "next/link";
import type { ReactNode } from "react";
import { HeaderAccount } from "@/components/HeaderAccount";
import { SignOutButton } from "@/components/SignOutButton";
import { Badge, Logo, cx } from "@/components/ui";

export type Portal = "host" | "admin";

/** Platform admins only: the two portals side by side, the current one filled. */
function PortalSwitch({ portal }: { portal: Portal }) {
  const item = (p: Portal, label: string, href: string) => (
    <Link
      href={href}
      aria-current={portal === p ? "page" : undefined}
      className={cx("rounded-full px-3 py-1 text-xs font-semibold transition-colors", portal === p ? "bg-ink text-surface-raised" : "text-ink-muted hover:text-ink")}
    >
      {label}
    </Link>
  );
  return (
    <nav className="flex items-center rounded-full border border-line bg-surface-sunken p-0.5" aria-label="Portal">
      {item("host", "Host", "/host")}
      {item("admin", "Admin", "/admin")}
    </nav>
  );
}

/**
 * Host-side chrome: a slim white top bar with the wordmark, an optional breadcrumb for the
 * room, and who is signed in. Content gets a wide, padded column underneath on the cream page.
 */
export function AppShell({
  children,
  crumb,
  email,
  wide,
  right,
  platformAdmin,
  portal = "host",
}: {
  children: ReactNode;
  crumb?: ReactNode;
  email?: string | null;
  wide?: boolean;
  right?: ReactNode;
  /** The signed-in user is a platform admin: show the switch between the host and admin portals. */
  platformAdmin?: boolean;
  /** Which portal the page belongs to; the wordmark and the switch follow it. */
  portal?: Portal;
}) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface-raised/95 backdrop-blur">
        <div className={wide ? "mx-auto flex h-14 max-w-screen-2xl items-center gap-4 px-4 sm:px-6" : "mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6"}>
          <Link href={portal === "admin" ? "/admin" : "/host"} className="shrink-0" aria-label={portal === "admin" ? "Admin" : "Your rooms"}>
            <Logo />
          </Link>
          {portal === "admin" && <Badge tone="brand">Admin</Badge>}
          {crumb && (
            <nav className="flex min-w-0 items-center gap-2 text-sm text-ink-muted" aria-label="Breadcrumb">
              <span aria-hidden>/</span>
              <span className="truncate font-semibold text-ink">{crumb}</span>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3 text-sm text-ink-muted">
            {right}
            {platformAdmin && <PortalSwitch portal={portal} />}
            {email && portal === "host" && (
              <Link href="/host/billing" className="font-semibold text-brand hover:text-brand-hover hover:underline">
                Billing
              </Link>
            )}
            {email && <span className="hidden max-w-48 truncate sm:inline">{email}</span>}
            {email && <SignOutButton />}
          </div>
        </div>
      </header>
      <main className={wide ? "mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6" : "mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6"}>{children}</main>
    </>
  );
}

/** The public header: the wordmark, the two public pages, and log in plus the button to hosting, or the dashboard for a signed-in host. */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface-raised/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Tertulia home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-semibold text-ink-muted md:flex" aria-label="Primary">
          <Link href="/explore" className="hover:text-ink">
            Explore rooms
          </Link>
          <Link href="/#how" className="hover:text-ink">
            How it works
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <HeaderAccount />
        </div>
      </div>
    </header>
  );
}

/** Attendee-side chrome: the public header, centred content, nothing competing with the room. */
export function PublicShell({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <>
      <PublicHeader />
      <main className={narrow ? "mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-8 sm:px-6" : "mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6"}>{children}</main>
    </>
  );
}

/** The espresso footer every public page ends on: wordmark, tagline, the links, the year. */
export function PublicFooter() {
  return (
    <footer className="bg-espresso text-cream">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <Logo className="text-cream" />
            <p className="mt-3 max-w-xs text-sm text-cream/70">Join live conversations that matter.</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm text-cream/80 sm:grid-cols-3" aria-label="Footer">
            <Link href="/explore" className="hover:text-cream hover:underline">
              Explore rooms
            </Link>
            <Link href="/for-hosts" className="hover:text-cream hover:underline">
              Host an event
            </Link>
            <Link href="/join" className="hover:text-cream hover:underline">
              Join with a code
            </Link>
            <Link href="/#how" className="hover:text-cream hover:underline">
              How it works
            </Link>
            <Link href="/for-hosts#pricing" className="hover:text-cream hover:underline">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-cream hover:underline">
              Log in
            </Link>
          </nav>
        </div>
        <p className="mt-10 border-t border-cream/15 pt-6 text-xs text-cream/60">© {new Date().getFullYear()} Tertulia</p>
      </div>
    </footer>
  );
}
