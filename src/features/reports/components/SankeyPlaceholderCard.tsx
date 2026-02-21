import { Card } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";

type SankeyPlaceholderCardProps = {
  description?: string;
  endpointHint?: string | null;
};

export function SankeyPlaceholderCard({
  description = "Visual de fluxo entre receitas e despesas entra na fase 2.",
  endpointHint = "/api/reports"
}: SankeyPlaceholderCardProps): React.JSX.Element {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Sankey (fase 2)
      </h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled
          title="Coming soon"
          aria-label="Enable Sankey (indisponível)"
        >
          Enable Sankey
        </Button>
        {endpointHint ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Endpoint disponível: <code>{endpointHint}</code>
          </p>
        ) : null}
      </div>
    </Card>
  );
}

