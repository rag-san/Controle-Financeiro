"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type MenuItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
};

type MenuProps = {
  trigger: React.ReactNode;
  triggerAriaLabel: string;
  items: MenuItem[];
  className?: string;
  menuClassName?: string;
  align?: "left" | "right";
};

export function Menu({
  trigger,
  triggerAriaLabel,
  items,
  className,
  menuClassName,
  align = "right"
}: MenuProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const firstItemRef = React.useRef<HTMLButtonElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuId = React.useId().replace(/:/g, "");

  React.useEffect(() => {
    if (!open) return;

    firstItemRef.current?.focus();

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  const close = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerAriaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((previous) => !previous);
          }
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {trigger}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={triggerAriaLabel}
          className={cn(
            "absolute z-20 mt-1 min-w-44 rounded-xl border border-border bg-card p-1 shadow-xl",
            align === "right" ? "right-0" : "left-0",
            menuClassName
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={index === 0 ? firstItemRef : null}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.onSelect();
                close();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                item.tone === "danger"
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-muted",
                item.disabled ? "cursor-not-allowed opacity-50" : ""
              )}
            >
              {item.icon ? <span className="h-4 w-4">{item.icon}</span> : null}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
