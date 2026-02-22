"use client";

import { Checkbox } from "@/components/ui/checkbox";

type RulesStepProps = {
  applyRules: boolean;
  onToggleRules: (value: boolean) => void;
};

export function RulesStep({
  applyRules,
  onToggleRules
}: RulesStepProps): React.JSX.Element {
  const rulesId = "rules-step-apply-rules";

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Checkbox
          id={rulesId}
          checked={applyRules}
          onChange={(event) => onToggleRules(Boolean(event.target.checked))}
          aria-describedby={`${rulesId}-description`}
        />
        <div>
          <label htmlFor={rulesId} className="font-medium">
            Aplicar regras de categorizacao automatica
          </label>
          <p id={`${rulesId}-description`} className="text-sm text-muted-foreground">
            Usa regras do tipo contains/regex cadastradas em Categorias {'>'} Automacoes.
          </p>
        </div>
      </div>
    </div>
  );
}


