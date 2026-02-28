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
      className="flex flex-col gap-2 rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50/80 via-white to-cyan-50/60 px-4 py-3 shadow-[0_8px_20px_rgba(14,116,144,0.12)] dark:border-sky-900/60 dark:from-slate-950 dark:via-slate-950 dark:to-sky-950/30 sm:flex-row sm:items-center sm:justify-between"
      aria-live="polite"
      aria-label="Ações em lote"
    >
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300" role="status" aria-live="polite">
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

