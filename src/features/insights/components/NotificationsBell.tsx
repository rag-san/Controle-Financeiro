"use client";

import { Bell } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { NotificationsDropdown } from "@/src/features/insights/components/NotificationsDropdown";
import type { Insight } from "@/src/features/insights/types";

export type NotificationsBellProps = {
  insights: Insight[];
  isLoading?: boolean;
  dismissedCount?: number;
  onDismissInsight?: (id: string) => void;
  onSnoozeInsight?: (id: string, days: 1 | 7) => void;
  onClearDismissed?: () => void;
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selectors =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const elements = container.querySelectorAll<HTMLElement>(selectors);
  return [...elements].filter((element) => !element.hasAttribute("aria-hidden"));
}

export function NotificationsBell({
  insights,
  isLoading = false,
  dismissedCount = 0,
  onDismissInsight,
  onSnoozeInsight,
  onClearDismissed
}: NotificationsBellProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const previousCountRef = useRef(insights.length);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const dropdownId = `notifications-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const previousCount = previousCountRef.current;
    if (insights.length !== previousCount) {
      setLiveMessage(
        insights.length === 1
          ? "1 notificação ativa."
          : `${insights.length} notificações ativas.`
      );
      previousCountRef.current = insights.length;
    } else {
      setLiveMessage("");
    }
  }, [insights.length]);

  useEffect(() => {
    if (!open) return;

    const focusTimer = window.setTimeout(() => {
      if (!dropdownRef.current) return;
      const focusables = getFocusableElements(dropdownRef.current);
      focusables[0]?.focus();
    }, 0);

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!dropdownRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(dropdownRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const activeCount = insights.length;

  return (
    <div className="relative" ref={rootRef}>
      <span className="sr-only" aria-live="polite">
        {liveMessage}
      </span>

      <button
        ref={buttonRef}
        type="button"
        aria-label="Abrir notificações"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dropdownId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition",
          "hover:bg-slate-100 hover:text-slate-700",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        )}
      >
        <Bell className="h-4 w-4" />
        {activeCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold leading-none text-white">
            {activeCount > 9 ? "9+" : activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <NotificationsDropdown
          id={dropdownId}
          ref={dropdownRef}
          insights={insights}
          isLoading={isLoading}
          dismissedCount={dismissedCount}
          onDismiss={(id) => onDismissInsight?.(id)}
          onSnooze={(id, days) => onSnoozeInsight?.(id, days)}
          onClearDismissed={onClearDismissed}
        />
      ) : null}
    </div>
  );
}

