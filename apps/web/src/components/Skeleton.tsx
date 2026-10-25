import { cx } from "@/components/ui/cx";

/*
 * Placeholder blocks for a route's loading state. The chrome of the page renders at once from
 * the segment's shell; these stand in for the content until the server render streams in.
 * They follow the spacing scale, sit in the page's own grid, and pulse gently (not at all
 * under reduced motion). One `aria-busy` region, so assistive tech announces the loading once.
 */
export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cx("h-4 rounded bg-surface-inset", className)} />;
}

export function SkeletonHeading({ className }: { className?: string }) {
  return <div className={cx("h-8 w-64 max-w-full rounded-md bg-surface-inset", className)} />;
}

export function SkeletonCard({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx("rounded-xl border border-line bg-surface-raised p-5 shadow-card", className)}>
      <SkeletonLine className="h-5 w-2/3" />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine key={i} className={i === lines - 1 ? "mt-3 w-1/2" : "mt-3 w-5/6"} />
      ))}
    </div>
  );
}

export function SkeletonRegion({ children, className, label = "Loading" }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div role="status" aria-busy aria-label={label} className={cx("animate-pulse", className)}>
      {children}
    </div>
  );
}
