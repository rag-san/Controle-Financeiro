"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, Trash2, TrendingUp, TriangleAlert } from "lucide-react";
import { fetchJsonOrThrow } from "@/src/features/shared/fetch";
import { cn } from "@/src/app-shell/utils";

type Insight = {
  id: string;
  title: string;
  message: string;
  severity?: "info" | "warning" | "critical" | "success";
};

type InsightsResponse = {
  insights: Insight[];
};

export function NotificationBell(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<Array<Insight & { read: boolean }>>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void fetchJsonOrThrow<InsightsResponse>("/api/insights")
      .then((response) => {
        setItems(response.insights.map((item) => ({ ...item, read: false })));
      })
      .catch(() => {
        setItems([]);
      });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell size={20} />
        {unreadCount > 0 ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-error ring-2 ring-background" /> : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-50 mt-3 w-80 overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Notificacoes</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setItems((previous) => previous.map((item) => ({ ...item, read: true })))}
                  className="text-primary transition-colors hover:text-primary/80"
                  title="Marcar todas como lidas"
                >
                  <Check size={14} />
                </button>
              ) : null}
              {items.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setItems([])}
                  className="text-muted-foreground transition-colors hover:text-error"
                  title="Limpar notificacoes"
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="hide-scrollbar max-h-[320px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma notificacao no momento.</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    setItems((previous) => previous.map((current) => (current.id === item.id ? { ...current, read: true } : current)))
                  }
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-secondary",
                    !item.read && "bg-primary/5"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      item.severity === "critical" || item.severity === "warning"
                        ? "bg-warning/10 text-warning"
                        : "bg-success/10 text-success"
                    )}
                  >
                    {item.severity === "critical" || item.severity === "warning" ? <TriangleAlert size={16} /> : <TrendingUp size={16} />}
                  </div>
                  <div className="min-w-0">
                    <p className={cn("truncate text-sm font-medium", !item.read ? "text-foreground" : "text-muted-foreground")}>
                      {item.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.message}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
