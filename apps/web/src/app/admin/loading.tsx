import { AppShell } from "@/components/AppShell";
import { SkeletonCard, SkeletonHeading, SkeletonLine, SkeletonRegion } from "@/components/Skeleton";

export default function AdminLoading() {
  return (
    <AppShell portal="admin">
      <SkeletonRegion label="Loading">
        <SkeletonHeading />
        <SkeletonLine className="mt-3 w-full max-w-md" />
        <div className="mt-8 space-y-4">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </div>
      </SkeletonRegion>
    </AppShell>
  );
}
