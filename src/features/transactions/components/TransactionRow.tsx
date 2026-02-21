"use client";

import * as React from "react";
import { format } from "date-fns";
import { MoreHorizontal, Pencil, Tag, Trash2 } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/src/components/ui/Button";
import { CategoryPill } from "@/src/components/ui/CategoryPill";
import { Checkbox } from "@/src/components/ui/Checkbox";
import { Menu } from "@/src/components/ui/Menu";
import { Select } from "@/src/components/ui/Select";
import type { Suggestion } from "@/src/features/categorization/suggestCategory";

type TransactionRowProps = {
  transaction: TransactionDTO;
  categories: CategoryDTO[];
  checked: boolean;
  suggestion?: Suggestion;
  applyingSuggestion?: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onCategoryChange: (id: string, categoryId: string | null) => void;
  onApplySuggestion?: (transaction: TransactionDTO, suggestion: Suggestion) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
};

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

export function TransactionRow({
  transaction,
  categories,
  checked,
  suggestion,
  applyingSuggestion = false,
  onToggleSelect,
  onCategoryChange,
  onApplySuggestion,
  onDelete,
  onEdit
}: TransactionRowProps): React.JSX.Element {
  const [showCategorySelect, setShowCategorySelect] = React.useState(false);
  const categorySelectRef = React.useRef<HTMLSelectElement | null>(null);

  React.useEffect(() => {
    if (!showCategorySelect) return;
    categorySelectRef.current?.focus();
  }, [showCategorySelect]);

  return (
    <TableRow data-state={checked ? "selected" : undefined}>
      <TableCell className="w-11 pr-2">
        <Checkbox
          checked={checked}
          onChange={(event) => onToggleSelect(transaction.id, Boolean(event.target.checked))}
          aria-label={
            checked
              ? `Desmarcar transacao ${transaction.description}`
              : `Selecionar transacao ${transaction.description}`
          }
        />
      </TableCell>

      <TableCell className="min-w-[240px]">
        <p className="font-semibold text-foreground">{transaction.description}</p>
      </TableCell>

      <TableCell className="min-w-[240px]">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryPill name={transaction.category?.name ?? "Sem categoria"} size="sm" />
          {suggestion ? (
            <span
              className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
              title={suggestion.reason}
            >
              Sugerido • {Math.round(suggestion.confidence * 100)}%
            </span>
          ) : null}
          {suggestion && onApplySuggestion ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-md px-2 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/30"
              onClick={() => onApplySuggestion(transaction, suggestion)}
              isLoading={applyingSuggestion}
              disabled={applyingSuggestion}
              title={suggestion.reason}
              aria-label={`Aplicar sugestao de categoria para ${transaction.description}`}
            >
              Aplicar
            </Button>
          ) : null}
          {showCategorySelect ? (
            <Select
              ref={categorySelectRef}
              aria-label={`Selecionar categoria para ${transaction.description}`}
              value={transaction.categoryId ?? ""}
              onChange={(event) => {
                onCategoryChange(transaction.id, event.target.value || null);
                setShowCategorySelect(false);
              }}
              onBlur={() => setShowCategorySelect(false)}
              className="h-8 min-w-[140px] rounded-lg text-xs"
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </TableCell>

      <TableCell className="min-w-[120px] text-sm text-muted-foreground">{transaction.account.name}</TableCell>

      <TableCell className="min-w-[120px] text-sm text-muted-foreground">
        {format(new Date(transaction.date), "dd/MM/yyyy")}
      </TableCell>

      <TableCell
        className={cn(
          "min-w-[140px] text-right text-sm font-bold",
          transaction.amount >= 0 ? "text-emerald-600" : "text-rose-600"
        )}
      >
        {brlFormatter.format(transaction.amount)}
      </TableCell>

      <TableCell className="w-14 text-right">
        <div className="flex justify-end">
          <Menu
            trigger={<MoreHorizontal className="h-4 w-4" />}
            triggerAriaLabel={`Acoes da transacao ${transaction.description}`}
            items={[
              {
                key: "edit",
                label: "Editar transacao",
                icon: <Pencil className="h-4 w-4" />,
                onSelect: () => onEdit?.(transaction.id)
              },
              {
                key: "change-category",
                label: "Alterar categoria",
                icon: <Tag className="h-4 w-4" />,
                onSelect: () => setShowCategorySelect(true)
              },
              {
                key: "delete",
                label: "Excluir",
                icon: <Trash2 className="h-4 w-4" />,
                tone: "danger",
                onSelect: () => onDelete(transaction.id)
              }
            ]}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
