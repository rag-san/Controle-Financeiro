"use client";

import { cn } from "@/lib/utils";

type PageContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export function PageContainer({ children, className }: PageContainerProps): React.JSX.Element {
  return <div className={cn("px-4 py-5 md:px-6 md:py-6 xl:px-8", className)}>{children}</div>;
}

