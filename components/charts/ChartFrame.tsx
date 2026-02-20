"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ChartSize = {
  width: number;
  height: number;
};

type ChartFrameProps = {
  className?: string;
  minHeight?: number;
  children: (size: ChartSize) => React.ReactNode;
};

export function ChartFrame({
  className,
  minHeight = 280,
  children
}: ChartFrameProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<ChartSize>({
    width: 0,
    height: minHeight
  });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = (): void => {
      const rect = node.getBoundingClientRect();
      const width = Math.max(0, Math.floor(rect.width));
      const height = Math.max(minHeight, Math.floor(rect.height) || minHeight);

      setSize((previous) => {
        if (previous.width === width && previous.height === height) {
          return previous;
        }
        return { width, height };
      });
    };

    update();

    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [minHeight]);

  return (
    <div ref={containerRef} className={cn("min-w-0 w-full", className)} style={{ minHeight }}>
      {size.width > 0 ? children(size) : null}
    </div>
  );
}

