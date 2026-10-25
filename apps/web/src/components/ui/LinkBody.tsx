"use client";
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";

/**
 * The inside of a ButtonLink. Next tells a Link's descendants when the navigation it started is
 * still in flight; while it is, a spinner takes the place of the label's leading space and the
 * label dims, the same shape a Button has with `loading`. A navigation that finishes inside
 * the first frames shows nothing, so a prefetched page never flashes a spinner.
 */
export function LinkBody({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending && <Spinner className="size-4" />}
      <span className={pending ? "opacity-70" : undefined}>{children}</span>
    </>
  );
}
