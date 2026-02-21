"use client";

import * as React from "react";

type UseAnimatedNumberOptions = {
  durationMs?: number;
};

function easeOutCubic(t: number): number {
  const inverted = 1 - t;
  return 1 - inverted * inverted * inverted;
}

export function useAnimatedNumber(
  targetValue: number,
  options: UseAnimatedNumberOptions = {}
): number {
  const { durationMs = 360 } = options;
  const [animatedValue, setAnimatedValue] = React.useState<number>(
    Number.isFinite(targetValue) ? targetValue : 0
  );
  const previousTargetRef = React.useRef<number>(Number.isFinite(targetValue) ? targetValue : 0);

  React.useEffect(() => {
    const nextValue = Number.isFinite(targetValue) ? targetValue : 0;
    const startValue = previousTargetRef.current;

    if (startValue === nextValue) {
      setAnimatedValue(nextValue);
      return;
    }

    const motionMediaQuery =
      typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

    if (motionMediaQuery?.matches) {
      setAnimatedValue(nextValue);
      previousTargetRef.current = nextValue;
      return;
    }

    const startTime = performance.now();
    let frameId = 0;

    const animate = (now: number): void => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / Math.max(1, durationMs));
      const easedProgress = easeOutCubic(progress);
      const value = startValue + (nextValue - startValue) * easedProgress;

      setAnimatedValue(value);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(animate);
      } else {
        previousTargetRef.current = nextValue;
      }
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [durationMs, targetValue]);

  return animatedValue;
}
