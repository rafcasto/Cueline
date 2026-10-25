"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * A 2px bar along the top of the window while a navigation is in flight. It covers every way
 * off a page that is not a ButtonLink: card titles, topic chips, nav links, and the GET search
 * form. It starts on the click (or submit) itself, so the acknowledgement is immediate, and
 * ends when the URL changes. A short delay before it is drawn keeps a fast, prefetched
 * navigation from flashing it. Decorative: the button or link that was pressed carries the
 * accessible state, and a screen reader hears the new page when it arrives.
 */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}

const SHOW_AFTER_MS = 120;
const GIVE_UP_MS = 20_000;

function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const here = `${pathname}?${search.toString()}`;
  // The URL the navigation started from. Once the URL differs, the page has arrived and the
  // bar is over, with no state to reset.
  const [from, setFrom] = useState<string | null>(null);
  const pending = from !== null && from === here;

  useEffect(() => {
    const start = () => setFrom(`${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`);
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      if (!leavesPage(a.href)) return;
      start();
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target;
      if (e.defaultPrevented || !(f instanceof HTMLFormElement) || f.method.toLowerCase() !== "get") return;
      if (!leavesPage(f.action, true)) return;
      start();
    };
    const stop = () => setFrom(null);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("popstate", stop);
    window.addEventListener("pageshow", stop);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("popstate", stop);
      window.removeEventListener("pageshow", stop);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setFrom(null), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [pending]);

  if (!pending) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5">
      <div className="nav-progress h-full bg-brand" style={{ animationDelay: `${SHOW_AFTER_MS}ms` }} />
    </div>
  );
}

/** Same origin, and a different document from the one on screen (a hash on this page is not a navigation). */
function leavesPage(href: string, form = false): boolean {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;
  if (form) return true;
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}
