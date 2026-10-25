import { AppShell } from "@/components/AppShell";
import { SkeletonCard, SkeletonHeading, SkeletonLine, SkeletonRegion } from "@/components/Skeleton";

/** The host pages (rooms, a room, billing) while their data loads: the bar at once, the content column after. */
export default function HostLoading() {
  return (
    <AppShell>
      <SkeletonRegion label="Loading">
        <SkeletonHeading />
        <SkeletonLine className="mt-3 w-full max-w-md" />
        <div className="mt-8 space-y-4">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={1} />
        </div>
      </SkeletonRegion>
    </AppShell>
  );
}
