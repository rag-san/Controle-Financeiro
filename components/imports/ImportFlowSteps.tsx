import { cn } from "@/lib/utils";

type ImportFlowStepsProps = {
  currentStep: 1 | 2 | 3 | 4;
};

const steps = [
  {
    number: 1,
    title: "Selecionar arquivo"
  },
  {
    number: 2,
    title: "Confirmar dados"
  },
  {
    number: 3,
    title: "Visualizar preview"
  },
  {
    number: 4,
    title: "Confirmar importacao"
  }
] as const;

export function ImportFlowSteps({ currentStep }: ImportFlowStepsProps): React.JSX.Element {
  const progressPercent = ((currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <section aria-labelledby="import-flow-steps-title" className="rounded-2xl border border-border/80 bg-card/70 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 id="import-flow-steps-title" className="text-sm font-semibold text-foreground">
          Fluxo de importacao
        </h3>
        <span className="rounded-full border border-border/80 bg-background/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Etapa {currentStep} de 4
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary/70">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
          aria-hidden="true"
        />
      </div>

      <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => {
          const isCompleted = step.number < currentStep;
          const isCurrent = step.number === currentStep;

          return (
            <li
              key={step.number}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "rounded-xl border px-2.5 py-2 transition",
                isCurrent && "border-primary/45 bg-primary/10",
                isCompleted && "border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-800/70 dark:bg-emerald-950/20",
                !isCurrent && !isCompleted && "border-border/70 bg-background/45"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                    isCompleted &&
                      "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500",
                    !isCurrent && !isCompleted && "border-border bg-card text-foreground"
                  )}
                >
                  {step.number}
                </span>
                <p className="truncate text-xs font-medium text-foreground">{step.title}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
