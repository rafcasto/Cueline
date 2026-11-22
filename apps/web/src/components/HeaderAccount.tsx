"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * The right end of the public header. A visitor sees Log in and Host an event; a signed-in
 * host sees one button to their dashboard, so coming back to the site never lands them on
 * the login form. Read in the browser so the public pages stay cacheable; attendees'
 * anonymous identities do not count.
 */
export function HeaderAccount() {
  const [host, setHost] = useState(false);
  useEffect(() => {
    // Nothing to ask without an auth cookie; the check is a local read of the cookie.
    if (!document.cookie.includes("-auth-token")) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser().auth.getSession();
      if (!cancelled && data.session && !data.session.user.is_anonymous) setHost(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (host) {
    return (
      <ButtonLink href="/host" variant="primary" size="sm" data-track="header_dashboard">
        Dashboard
      </ButtonLink>
    );
  }
  return (
    <>
      <Link href="/login" className="hidden text-sm font-semibold text-brand hover:text-brand-hover hover:underline sm:inline">
        Log in
      </Link>
      <ButtonLink href="/for-hosts" variant="secondary" size="sm" data-track="header_host_event">
        Host an event
      </ButtonLink>
    </>
  );
}
