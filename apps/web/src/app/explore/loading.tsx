import { PublicShell } from "@/components/AppShell";
import { SkeletonCard, SkeletonHeading, SkeletonLine, SkeletonRegion } from "@/components/Skeleton";

/** Explore and a room's public page while the directory is read: the shell at once, cards in the same grid. */
export default function ExploreLoading() {
  return (
    <PublicShell>
      <SkeletonRegion className="pt-6 sm:pt-10" label="Loading events">
        <SkeletonLine className="h-3 w-20" />
        <SkeletonHeading className="mt-3" />
        <SkeletonLine className="mt-3 w-full max-w-lg" />
        <SkeletonLine className="mt-6 h-10 w-full max-w-xl rounded-lg" />
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      </SkeletonRegion>
    </PublicShell>
  );
}
