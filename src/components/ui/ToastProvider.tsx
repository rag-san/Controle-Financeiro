"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

type ToastPayload = {
  title?: string;
  description: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastItem = {
  id: string;
  title?: string;
  description: string;
  variant: ToastVariant;
  durationMs: number;
};

type ToastContextValue = {
  toast: (payload: ToastPayload) => void;
  dismissToast: (id: string) => void;
};

const toastStyleByVariant: Record<ToastVariant, string> = {
  info: "border-border bg-card text-foreground",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  error: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

function createToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const timeoutByIdRef = React.useRef<Record<string, number>>({});

  const dismissToast = React.useCallback((id: string): void => {
    setToasts((previous) => previous.filter((item) => item.id !== id));

    const timeoutId = timeoutByIdRef.current[id];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete timeoutByIdRef.current[id];
    }
  }, []);

  const toast = React.useCallback(
    ({ title, description, variant = "info", durationMs = 4000 }: ToastPayload): void => {
      const id = createToastId();

      setToasts((previous) => [{ id, title, description, variant, durationMs }, ...previous].slice(0, 5));

      timeoutByIdRef.current[id] = window.setTimeout(() => {
        dismissToast(id);
      }, durationMs);
    },
    [dismissToast]
  );

  React.useEffect(() => {
    return () => {
      Object.values(timeoutByIdRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutByIdRef.current = {};
    };
  }, []);

  const value = React.useMemo<ToastContextValue>(() => ({ toast, dismissToast }), [toast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map((item) => (
          <div
            key={item.id}
            role={item.variant === "error" ? "alert" : "status"}
            aria-live={item.variant === "error" ? "assertive" : "polite"}
            className={cn(
              "pointer-events-auto rounded-xl border p-3 shadow-lg backdrop-blur-sm transition",
              toastStyleByVariant[item.variant]
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                {item.title ? <p className="text-sm font-semibold">{item.title}</p> : null}
                <p className="text-sm">{item.description}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(item.id)}
                className="rounded-md p-1 text-current/75 transition hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
                aria-label="Fechar notificacao"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast deve ser usado dentro de ToastProvider.");
  }
  return context;
}
