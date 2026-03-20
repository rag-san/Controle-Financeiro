"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/Button";

const ONBOARDING_STORAGE_KEY = "finance-control:onboarding:v2";
const TARGET_HIGHLIGHT_CLASS = "onboarding-highlight";

type TourStep = {
  selectors: string[];
  title: string;
  description: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    selectors: ["#tour-dashboard-import"],
    title: "Comece por aqui",
    description: "Clique em Importar extrato para trazer suas transacoes automaticamente."
  },
  {
    selectors: ["#tour-dashboard-filters"],
    title: "Use filtros quando precisar",
    description: "Ajuste o periodo para comparar resultados do dashboard."
  },
  {
    selectors: ["#tour-dashboard-empty-import", "#tour-dashboard-top-categories"],
    title: "Revise os resultados",
    description: "Depois da importacao, acompanhe categorias e indicadores para entender seus gastos."
  }
];

function hasSeenOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "done";
}

function persistOnboarding(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "done");
}

export function AppOnboarding(): React.JSX.Element | null {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const [targetElement, setTargetElement] = React.useState<HTMLElement | null>(null);
  const [popoverPosition, setPopoverPosition] = React.useState({ top: 24, left: 24 });
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  const currentStep = TOUR_STEPS[currentStepIndex] ?? null;

  const findTargetForStep = React.useCallback((stepIndex: number): HTMLElement | null => {
    const step = TOUR_STEPS[stepIndex];
    if (!step) return null;

    for (const selector of step.selectors) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return element;
    }

    return null;
  }, []);

  const resolveNextValidStep = React.useCallback(
    (startIndex: number): { stepIndex: number; target: HTMLElement } | null => {
      for (let index = startIndex; index < TOUR_STEPS.length; index += 1) {
        const target = findTargetForStep(index);
        if (target) {
          return { stepIndex: index, target };
        }
      }
      return null;
    },
    [findTargetForStep]
  );

  const updatePopoverPosition = React.useCallback((): void => {
    if (!targetElement || !popoverRef.current) return;

    const rect = targetElement.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;

    let left = rect.left;
    let top = rect.bottom + 12;

    if (left + popoverRect.width + margin > viewportWidth) {
      left = viewportWidth - popoverRect.width - margin;
    }
    if (left < margin) left = margin;

    if (top + popoverRect.height + margin > viewportHeight) {
      top = rect.top - popoverRect.height - 12;
    }
    if (top < margin) top = margin;

    setPopoverPosition({
      top: Math.round(top),
      left: Math.round(left)
    });
  }, [targetElement]);

  React.useEffect(() => {
    setReady(true);
    if (pathname !== "/dashboard") {
      setOpen(false);
      setTargetElement(null);
      return;
    }

    const shouldOpen = !hasSeenOnboarding();
    setOpen(shouldOpen);
    if (shouldOpen) {
      setCurrentStepIndex(0);
    }
  }, [pathname]);

  React.useEffect(() => {
    if (!open || pathname !== "/dashboard") return;

    const next = resolveNextValidStep(currentStepIndex);
    if (!next) {
      persistOnboarding();
      setOpen(false);
      setTargetElement(null);
      return;
    }

    if (next.stepIndex !== currentStepIndex) {
      setCurrentStepIndex(next.stepIndex);
      return;
    }

    setTargetElement(next.target);
  }, [currentStepIndex, open, pathname, resolveNextValidStep]);

  React.useEffect(() => {
    if (!open || !targetElement) return;

    targetElement.classList.add(TARGET_HIGHLIGHT_CLASS);
    targetElement.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

    return () => {
      targetElement.classList.remove(TARGET_HIGHLIGHT_CLASS);
    };
  }, [open, targetElement]);

  React.useEffect(() => {
    if (!open || !targetElement) return;

    const update = (): void => {
      updatePopoverPosition();
    };

    const raf = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, targetElement, updatePopoverPosition]);

  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      persistOnboarding();
      setOpen(false);
      setTargetElement(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const closeOnboarding = React.useCallback((): void => {
    persistOnboarding();
    setOpen(false);
    setTargetElement(null);
  }, []);

  const handleNext = React.useCallback((): void => {
    if (currentStepIndex >= TOUR_STEPS.length - 1) {
      closeOnboarding();
      return;
    }
    setCurrentStepIndex((previous) => previous + 1);
  }, [closeOnboarding, currentStepIndex]);

  const handlePrevious = React.useCallback((): void => {
    setCurrentStepIndex((previous) => Math.max(0, previous - 1));
  }, []);

  const handleStartImport = React.useCallback((): void => {
    closeOnboarding();
    router.push("/transactions?import=1");
  }, [closeOnboarding, router]);

  if (!ready || pathname !== "/dashboard" || !open || !currentStep || !targetElement) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-[138] bg-black/45" aria-hidden="true" />
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tutorial guiado"
        className="fixed z-[139] w-[min(92vw,360px)] rounded-2xl border border-border/90 bg-card p-4 shadow-2xl"
        style={{ top: popoverPosition.top, left: popoverPosition.left }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
          Tutorial {currentStepIndex + 1} de {TOUR_STEPS.length}
        </p>
        <h3 className="mt-2 text-base font-semibold text-foreground">{currentStep.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{currentStep.description}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={closeOnboarding}>
            Pular
          </Button>
          {currentStepIndex > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={handlePrevious}>
              Voltar
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={handleNext}>
            {currentStepIndex === TOUR_STEPS.length - 1 ? "Concluir" : "Proximo"}
          </Button>
          {currentStepIndex === 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={handleStartImport}>
              Abrir importacao
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}
