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

function normalizeHint(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function readRawText(transaction: TransactionDTO, key: string): string {
  const raw = transaction.raw;
  if (!raw || typeof raw !== "object") return "";
  const value = raw[key];
  return typeof value === "string" ? value : "";
}

function resolveMethodFromHint(hint: string): string | null {
  if (!hint) return null;

  if (hint.includes("PIX")) return "PIX";
  if (hint.includes("TED")) return "TED";
  if (hint.includes("DOC")) return "DOC";
  if (hint.includes("BOLETO")) return "Boleto";
  if (hint.includes("CARTAO") || hint.includes("CREDITO")) return "Cartão";
  if (hint.includes("DEBITO")) return "Débito";
  if (hint.includes("TRANSFER")) return "Transferência";
  if (hint.includes("SAQUE")) return "Saque";
  if (hint.includes("TARIFA")) return "Tarifa";
  if (hint.includes("PAGAMENTO")) return "Pagamento";
  if (hint.includes("COMPRA")) return "Compra";

  return null;
}

function inferMovementMethod(transaction: TransactionDTO): string {
  const rawKind = readRawText(transaction, "transactionKindRaw");
  const rawKindNorm = readRawText(transaction, "transactionKindNorm");
  const normalizedCandidates = [
    normalizeHint(rawKind),
    normalizeHint(rawKindNorm),
    normalizeHint(transaction.description),
    normalizeHint(transaction.category?.name ?? "")
  ];

  for (const candidate of normalizedCandidates) {
    const resolved = resolveMethodFromHint(candidate);
    if (resolved) {
      if (resolved === "Transferência" && transaction.type === "transfer" && transaction.isInternalTransfer) {
        return "Transferência interna";
      }
      return resolved;
    }
  }

  if (transaction.type === "transfer") {
    return transaction.isInternalTransfer ? "Transferência interna" : "Transferência";
  }

  return transaction.status === "pending" ? "Pendente" : "Outro";
}

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
  const isTransfer = transaction.type === "transfer";
  const formattedAmount = brlFormatter.format(Math.abs(transaction.amount));
  const amountPrefix = transaction.amount < 0 ? "-" : "+";
  const detailLabel = transaction.status === "pending" ? "Pendente" : inferMovementMethod(transaction);
  const natureLabel = isTransfer ? "Transferência" : transaction.type === "income" ? "Receita" : "Despesa";
  const subtitleLabel = isTransfer ? detailLabel : `${natureLabel} • ${detailLabel}`;
  const categoryName = isTransfer ? "Transferencia" : transaction.category?.name ?? "Sem categoria";
  const actionMenuItems = [
    ...(!isTransfer
      ? [
          {
            key: "edit",
            label: "Editar transação",
            icon: <Pencil className="h-4 w-4" />,
            onSelect: () => onEdit?.(transaction.id)
          },
          {
            key: "change-category",
            label: "Alterar categoria",
            icon: <Tag className="h-4 w-4" />,
            onSelect: () => setShowCategorySelect(true)
          }
        ]
      : []),
    {
      key: "delete",
      label: "Excluir",
      icon: <Trash2 className="h-4 w-4" />,
      tone: "danger" as const,
      onSelect: () => onDelete(transaction.id)
    }
  ];

  React.useEffect(() => {
    if (!showCategorySelect) return;
    categorySelectRef.current?.focus();
  }, [showCategorySelect]);

  return (
    <TableRow
      data-state={checked ? "selected" : undefined}
      className="border-slate-200/70 hover:bg-slate-50/60 data-[state=selected]:bg-sky-50/60 dark:border-slate-800 dark:hover:bg-slate-900/40 dark:data-[state=selected]:bg-sky-950/25"
    >
      <TableCell className="w-9 py-3 pl-2 pr-1 md:w-11 md:pr-2">
        <Checkbox
          checked={checked}
          onChange={(event) => onToggleSelect(transaction.id, Boolean(event.target.checked))}
          aria-label={
            checked
              ? `Desmarcar transação ${transaction.description}`
              : `Selecionar transação ${transaction.description}`
          }
        />
      </TableCell>

      <TableCell className="min-w-0 py-3 px-2 md:min-w-[240px] md:px-4">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">
            {transaction.description}
          </p>
          <div className="md:hidden">
            <Menu
              trigger={<MoreHorizontal className="h-4 w-4" />}
              triggerAriaLabel={`Ações da transação ${transaction.description}`}
              items={actionMenuItems}
            />
          </div>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{subtitleLabel}</p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 sm:hidden">{categoryName}</p>
        {suggestion && onApplySuggestion ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-2 h-7 rounded-md px-2 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40 dark:hover:text-sky-200 sm:hidden"
            onClick={() => onApplySuggestion(transaction, suggestion)}
            isLoading={applyingSuggestion}
            disabled={applyingSuggestion}
            title={suggestion.reason}
            aria-label={`Aplicar sugestao de categoria para ${transaction.description}`}
          >
            Aplicar sugestão
          </Button>
        ) : null}
        {showCategorySelect && !isTransfer ? (
          <Select
            ref={categorySelectRef}
            aria-label={`Selecionar categoria para ${transaction.description}`}
            value={transaction.categoryId ?? ""}
            onChange={(event) => {
              onCategoryChange(transaction.id, event.target.value || null);
              setShowCategorySelect(false);
            }}
            onBlur={() => setShowCategorySelect(false)}
            className="mt-2 h-8 min-w-[150px] rounded-lg border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-900 sm:hidden"
          >
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        ) : null}
      </TableCell>

      <TableCell className="hidden min-w-[120px] py-3 px-2 sm:table-cell md:min-w-[220px] md:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryPill name={categoryName} size="sm" className="font-semibold" />
          {suggestion ? (
            <span
              className="inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
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
              className="h-7 rounded-md px-2 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40 dark:hover:text-sky-200"
              onClick={() => onApplySuggestion(transaction, suggestion)}
              isLoading={applyingSuggestion}
              disabled={applyingSuggestion}
              title={suggestion.reason}
              aria-label={`Aplicar sugestao de categoria para ${transaction.description}`}
            >
              Aplicar
            </Button>
          ) : null}
          {showCategorySelect && !isTransfer ? (
            <Select
              ref={categorySelectRef}
              aria-label={`Selecionar categoria para ${transaction.description}`}
              value={transaction.categoryId ?? ""}
              onChange={(event) => {
                onCategoryChange(transaction.id, event.target.value || null);
                setShowCategorySelect(false);
              }}
              onBlur={() => setShowCategorySelect(false)}
              className="hidden h-8 min-w-[150px] rounded-lg border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-900 sm:block"
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

      <TableCell className="hidden min-w-[130px] py-3 text-sm text-slate-600 dark:text-slate-300 md:table-cell">
        {transaction.account.name}
      </TableCell>

      <TableCell className="hidden min-w-[120px] py-3 text-sm text-slate-500 dark:text-slate-400 md:table-cell">
        {format(new Date(transaction.date), "dd/MM/yyyy")}
      </TableCell>

      <TableCell
        className={cn(
          "min-w-[112px] py-3 px-2 text-right text-sm font-extrabold md:min-w-[148px] md:px-4",
          transaction.amount >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
        )}
      >
        {`${amountPrefix} ${formattedAmount}`}
      </TableCell>

      <TableCell className="hidden w-14 py-3 text-right md:table-cell">
        <div className="flex justify-end">
          <Menu
            trigger={<MoreHorizontal className="h-4 w-4" />}
            triggerAriaLabel={`Ações da transação ${transaction.description}`}
            items={actionMenuItems}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

