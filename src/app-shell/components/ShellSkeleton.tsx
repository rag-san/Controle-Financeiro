import { cn } from "@/src/app-shell/utils";

export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return <div className={cn("animate-shimmer rounded-2xl bg-muted", className)} />;
}

export function PageSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-64" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="glass-card h-72 lg:col-span-2" />
        <Skeleton className="glass-card h-72" />
      </div>
      <Skeleton className="glass-card h-96" />
    </div>
  );
}
