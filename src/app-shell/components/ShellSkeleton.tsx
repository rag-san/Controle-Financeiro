import React from 'react';
import { cn } from '../utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("animate-shimmer rounded-md", className)} />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        <Skeleton className="h-[280px] w-full lg:col-span-2 lg:h-[400px]" />
        <Skeleton className="h-[280px] w-full lg:h-[400px]" />
      </div>
    </div>
  );
}
