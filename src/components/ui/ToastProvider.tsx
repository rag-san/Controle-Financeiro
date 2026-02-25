"use client";

import * as React from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
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
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-slate-950 dark:text-sky-100",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-slate-950 dark:text-emerald-100",
  error: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-slate-950 dark:text-rose-100"
};

const toastIconByVariant: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  error: TriangleAlert
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
      <div className="pointer-events-none fixed right-3 top-3 z-[220] flex w-[min(92vw,22rem)] flex-col gap-2 sm:right-4 sm:top-4">
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
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                {React.createElement(toastIconByVariant[item.variant], {
                  className: "mt-0.5 h-4 w-4 shrink-0 opacity-90"
                })}
                <div className="min-w-0 space-y-0.5">
                  {item.title ? <p className="text-sm font-semibold">{item.title}</p> : null}
                  <p className="text-sm">{item.description}</p>
                </div>
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
