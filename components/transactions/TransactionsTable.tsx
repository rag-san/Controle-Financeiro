"use client";

import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { CategoryBadge } from "@/components/transactions/CategoryBadge";
import { TransactionRowActions } from "@/components/transactions/TransactionRowActions";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CategoryDTO, TransactionDTO } from "@/lib/types";

type TransactionsTableProps = {
  items: TransactionDTO[];
  categories: CategoryDTO[];
  selectedIds: string[];
  onToggleSelectAll: (checked: boolean) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onCategoryChange: (transactionId: string, categoryId: string | null) => void;
  onDelete: (transactionId: string) => void;
};

export function TransactionsTable({
  items,
  categories,
  selectedIds,
  onToggleSelectAll,
  onToggleSelect,
  onCategoryChange,
  onDelete
}: TransactionsTableProps): React.JSX.Element {
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                onChange={(event) => onToggleSelectAll(Boolean(event.target.checked))}
                aria-label={allSelected ? "Desmarcar todas as transacoes" : "Selecionar todas as transacoes"}
              />
            </TableHead>
            <TableHead>Descricao</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right">Acoes</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                Nenhuma transacao encontrada para os filtros selecionados.
              </TableCell>
            </TableRow>
          ) : (
            items.map((transaction) => {
              const checked = selectedIds.includes(transaction.id);

              return (
                <TableRow key={transaction.id}>
                  <TableCell>
                    <Checkbox
                      checked={checked}
                      onChange={(event) => onToggleSelect(transaction.id, Boolean(event.target.checked))}
                      aria-label={checked ? `Desmarcar ${transaction.description}` : `Selecionar ${transaction.description}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{transaction.description}</div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <CategoryBadge
                        name={transaction.category?.name ?? "Sem categoria"}
                        color={transaction.category?.color}
                      />
                      <Select
                        className="h-8 text-xs"
                        value={transaction.categoryId ?? ""}
                        aria-label={`Categoria da transacao ${transaction.description}`}
                        onChange={(event) =>
                          onCategoryChange(transaction.id, event.target.value || null)
                        }
                      >
                        <option value="">Sem categoria</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>{transaction.account.name}</TableCell>
                  <TableCell>{format(new Date(transaction.date), "dd/MM/yyyy")}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-semibold",
                      transaction.amount >= 0 ? "text-emerald-600" : "text-rose-600"
                    )}
                  >
                    {formatMoney(transaction.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <TransactionRowActions onDelete={() => onDelete(transaction.id)} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}


