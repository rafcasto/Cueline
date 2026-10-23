import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/SignOutButton";
import { Logo } from "@/components/ui";

/**
 * Host-side chrome: a slim top bar with the logo, an optional breadcrumb for the room, and
 * who is signed in. Content gets a wide, padded column underneath.
 */
export function AppShell({ children, crumb, email, wide, right }: { children: ReactNode; crumb?: ReactNode; email?: string | null; wide?: boolean; right?: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface-raised/90 backdrop-blur">
        <div className={wide ? "mx-auto flex h-14 max-w-screen-2xl items-center gap-4 px-4 sm:px-6" : "mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6"}>
          <Link href="/host" className="shrink-0">
            <Logo />
          </Link>
          {crumb && (
            <nav className="flex min-w-0 items-center gap-2 text-sm text-ink-muted" aria-label="Breadcrumb">
              <span aria-hidden>/</span>
              <span className="truncate font-medium text-ink">{crumb}</span>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3 text-sm text-ink-muted">
            {right}
            {email && <span className="hidden max-w-48 truncate sm:inline">{email}</span>}
            {email && <SignOutButton />}
          </div>
        </div>
      </header>
      <main className={wide ? "mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6" : "mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6"}>{children}</main>
    </>
  );
}

/** Attendee-side chrome: just the logo, centred content, nothing competing with the room. */
export function PublicShell({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <>
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/">
          <Logo />
        </Link>
        <Link href="/login" className="text-sm font-medium text-ink-muted hover:text-ink">
          Host sign in
        </Link>
      </header>
      <main className={narrow ? "mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-6 sm:px-6" : "mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-4 sm:px-6"}>{children}</main>
    </>
  );
}
