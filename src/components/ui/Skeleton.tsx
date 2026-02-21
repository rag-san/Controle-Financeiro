import * as React from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps): React.JSX.Element {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
