import { Download, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/src/components/ui/Button";

type BulkActionsBarProps = {
  selectedCount: number;
  suggestionCount?: number;
  deleting?: boolean;
  categorizing?: boolean;
  exporting?: boolean;
  applyingSuggestions?: boolean;
  onClearSelection: () => void;
  onDelete: () => void;
  onSetCategory: () => void;
  onExport?: () => void;
  onApplySuggestions?: () => void;
};

export function BulkActionsBar({
  selectedCount,
  suggestionCount = 0,
  deleting = false,
  categorizing = false,
  exporting = false,
  applyingSuggestions = false,
  onClearSelection,
  onDelete,
  onSetCategory,
  onExport,
  onApplySuggestions
}: BulkActionsBarProps): React.JSX.Element | null {
  if (selectedCount <= 0) {
    return null;
  }

  const busy = deleting || categorizing || exporting || applyingSuggestions;

  return (
    <section
      className="flex flex-col gap-2 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between"
      aria-live="polite"
      aria-label="Acoes em lote"
    >
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {selectedCount} selecionada(s)
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={busy}
          aria-label="Limpar selecao"
        >
          <X className="h-4 w-4" />
          Limpar
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSetCategory}
          disabled={busy}
          isLoading={categorizing}
          aria-label="Definir categoria para selecionadas"
        >
          <Tag className="h-4 w-4" />
          Definir categoria
        </Button>

        {onExport ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExport}
            disabled={busy}
            isLoading={exporting}
            aria-label="Exportar selecionadas"
          >
            <Download className="h-4 w-4" />
            Exportar
          </Button>
        ) : null}

        {onApplySuggestions && suggestionCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onApplySuggestions}
            disabled={busy}
            isLoading={applyingSuggestions}
            aria-label="Aplicar sugestões para selecionadas"
          >
            <Tag className="h-4 w-4" />
            Aplicar sugestões ({suggestionCount})
          </Button>
        ) : null}

        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={onDelete}
          disabled={busy}
          isLoading={deleting}
          aria-label="Excluir selecionadas"
        >
          <Trash2 className="h-4 w-4" />
          Excluir
        </Button>
      </div>
    </section>
  );
}
