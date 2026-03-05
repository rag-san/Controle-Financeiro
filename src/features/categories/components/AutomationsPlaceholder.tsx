import { Sparkles } from "lucide-react";
import { Card } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";

export function AutomationsPlaceholder(): React.JSX.Element {
  return (
    <Card className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm dark:border-border dark:bg-card">
      <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground dark:bg-secondary/60 dark:text-muted-foreground">
        <Sparkles className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">Regras automáticas em breve</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Em breve você poderá criar regras automáticas para categorizar transações.
      </p>
      <Button type="button" size="sm" variant="outline" className="mt-4" disabled aria-label="Criar regra (em breve)">
        Criar regra
      </Button>
    </Card>
  );
}


