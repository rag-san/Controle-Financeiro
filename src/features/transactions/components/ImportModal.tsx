"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Trash2, UploadCloud, X } from "lucide-react";
import { motion } from "motion/react";
import type { AccountDTO, CategoryDTO } from "@/lib/types";
import { useAppShell } from "@/src/app-shell/AppShellContext";
import { cn, formatCurrency } from "@/src/app-shell/utils";
import { fetchJsonOrThrow, notifyFinanceDataChanged } from "@/src/features/shared/fetch";
import { resolveImportPreviewTotal } from "@/src/features/transactions/components/import-preview-total";

type ImportStep = "upload" | "processing" | "mapping" | "preview" | "success";

type CsvMapping = {
  date: string;
  description: string;
  history?: string;
  amount?: string;
  debit?: string;
  credit?: string;
  type?: string;
  account?: string;
  balanceAfter?: string;
};

type ImportCommitRow = {
  date: string;
  description: string;
  amount: number;
  type?: "income" | "expense" | "transfer";
  balanceAfter?: number | null;
  externalId?: string;
  transactionKindRaw?: string;
  counterpartyRaw?: string;
  transactionKindNorm?: string;
  counterpartyNorm?: string;
  merchantKey?: string;
  transferToAccountId?: string;
  transferFromAccountId?: string;
  categoryId?: string | null;
  categorySource?: string | null;
  categoryConfidence?: "high" | "medium" | "low" | "none" | null;
  categoryReason?: string | null;
  categoryNeedsReview?: boolean;
  accountId?: string;
  accountHint?: string;
  documentType?: string | null;
  sourceType?: "csv" | "ofx" | "pdf" | "manual";
  raw?: Record<string, unknown>;
};

type ParsePreviewRow = {
  commitIndex: number | null;
  status: "ok" | "ignored" | "error";
  accountHint?: string;
};

type ImportParseResponse = {
  sourceType: "csv" | "ofx" | "pdf";
  documentType?: string | null;
  issuerProfile?: string | null;
  columns?: string[];
  sampleRows?: Array<Record<string, string>>;
  suggestedMapping?: Partial<CsvMapping>;
  mappingDiagnostics?: {
    missingRequired?: string[];
    message?: string;
  };
  metadata?: {
    accountHint?: string | null;
    openingBalance?: number | null;
    closingBalance?: number | null;
    invoicePurchaseTotal?: number | null;
    invoicePaymentTotal?: number | null;
    invoiceTotalDue?: number | null;
    [key: string]: unknown;
  };
  accountHint?: string | null;
  rows: ImportCommitRow[];
  preview: ParsePreviewRow[];
  needsMapping: boolean;
};

type ImportCommitResponse = {
  totalImported: number;
  totalSkipped: number;
  warnings?: string[];
};

type PreviewTransaction = {
  id: string;
  description: string;
  date: string;
  amount: number;
  signedAmount: number;
  type: "income" | "expense" | "transfer";
  documentType?: string | null;
  categoryId: string | null;
  account: string;
  hasError: boolean;
  needsReview: boolean;
};

const EMPTY_MAPPING: CsvMapping = {
  date: "",
  description: "",
  history: "",
  amount: "",
  debit: "",
  credit: "",
  type: "",
  account: "",
  balanceAfter: ""
};

const CSV_MAPPING_FIELDS: Array<{ key: keyof CsvMapping; label: string; required: boolean }> = [
  { key: "date", label: "Data", required: true },
  { key: "description", label: "Descricao", required: true },
  { key: "amount", label: "Valor unico", required: false },
  { key: "debit", label: "Debito / saida", required: false },
  { key: "credit", label: "Credito / entrada", required: false },
  { key: "history", label: "Historico", required: false },
  { key: "type", label: "Tipo", required: false },
  { key: "account", label: "Conta", required: false },
  { key: "balanceAfter", label: "Saldo apos a linha", required: false }
];

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function matchAccount(accounts: AccountDTO[], hint?: string | null): AccountDTO | null {
  if (!hint) return null;
  const target = normalize(hint);
  return accounts.find((account) => normalize(account.name).includes(target) || normalize(account.institution ?? "").includes(target)) ?? null;
}

function formatImportDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function inferClosingBalance(rows: ImportCommitRow[], metadata?: ImportParseResponse["metadata"]): number | null {
  if (Number.isFinite(metadata?.closingBalance)) {
    return Number(metadata?.closingBalance);
  }

  const lastAnchoredRow = [...rows].reverse().find((row) => Number.isFinite(row.balanceAfter));
  return Number.isFinite(lastAnchoredRow?.balanceAfter) ? Number(lastAnchoredRow?.balanceAfter) : null;
}

function compactMapping(mapping: CsvMapping): CsvMapping {
  return Object.fromEntries(
    Object.entries(mapping).filter(([, value]) => typeof value === "string" && value.trim().length > 0)
  ) as CsvMapping;
}

function csvMappingPresetKey(columns: string[]): string {
  return `finance.import.csvMapping:${columns.join("|")}`;
}

function loadCsvMappingPreset(columns: string[]): Partial<CsvMapping> | null {
  if (typeof window === "undefined" || columns.length === 0) return null;

  try {
    const raw = window.localStorage.getItem(csvMappingPresetKey(columns));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CsvMapping>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "string" && columns.includes(value))
    ) as Partial<CsvMapping>;
  } catch {
    return null;
  }
}

function saveCsvMappingPreset(columns: string[], mapping: CsvMapping): void {
  if (typeof window === "undefined" || columns.length === 0) return;

  try {
    window.localStorage.setItem(csvMappingPresetKey(columns), JSON.stringify(compactMapping(mapping)));
  } catch {
    // localStorage can be unavailable in private contexts; import should continue.
  }
}

function previewTypeLabel(item: PreviewTransaction): string {
  if (item.type === "transfer") return "Transferencia";
  if (item.documentType === "credit_card_invoice") return "Compra no cartao";
  return item.type === "income" ? "Entrada" : "Saida";
}

function previewTypeClass(item: PreviewTransaction): string {
  if (item.type === "transfer") return "border-info/30 bg-info/10 text-info";
  if (item.type === "income") return "border-success/30 bg-success/10 text-success";
  if (item.documentType === "credit_card_invoice") return "border-warning/30 bg-warning/10 text-warning";
  return "border-error/30 bg-error/10 text-error";
}

function previewAmountClass(item: PreviewTransaction): string {
  if (item.type === "transfer") return "text-info";
  if (item.signedAmount >= 0) return "text-success";
  return "text-error";
}

export function ImportModal(): React.JSX.Element | null {
  const { isImportModalOpen, closeImportModal } = useAppShell();
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState<ImportCommitRow[]>([]);
  const [preview, setPreview] = useState<PreviewTransaction[]>([]);
  const [sourceType, setSourceType] = useState<"csv" | "ofx" | "pdf">("csv");
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [accountMode, setAccountMode] = useState<"auto" | "existing" | "new">("auto");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [commitResult, setCommitResult] = useState<ImportCommitResponse | null>(null);
  const [closingBalance, setClosingBalance] = useState<number | null>(null);
  const [previewDocumentType, setPreviewDocumentType] = useState<string | null>(null);
  const [previewMetadata, setPreviewMetadata] = useState<ImportParseResponse["metadata"] | null>(null);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [csvSampleRows, setCsvSampleRows] = useState<Array<Record<string, string>>>([]);
  const [csvMapping, setCsvMapping] = useState<CsvMapping>(EMPTY_MAPPING);
  const [mappingHint, setMappingHint] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isImportModalOpen) return;
    void Promise.all([fetchJsonOrThrow<AccountDTO[]>("/api/accounts"), fetchJsonOrThrow<CategoryDTO[]>("/api/categories")]).then(
      ([nextAccounts, nextCategories]) => {
        setAccounts(nextAccounts);
        setCategories(nextCategories);
      }
    );
    setStep("upload");
    setFile(null);
    setProgress(0);
    setRows([]);
    setPreview([]);
    setAccountMode("auto");
    setSelectedAccountId("");
    setNewAccountName("");
    setErrorMessage("");
    setCommitResult(null);
    setClosingBalance(null);
    setPreviewDocumentType(null);
    setPreviewMetadata(null);
    setCsvColumns([]);
    setCsvSampleRows([]);
    setCsvMapping(EMPTY_MAPPING);
    setMappingHint("");
  }, [isImportModalOpen]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  const startProgress = (): void => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setProgress(8);
    timerRef.current = window.setInterval(() => {
      setProgress((current) => (current >= 90 ? current : current + 6));
    }, 120);
  };

  const stopProgress = (value = 100): void => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setProgress(value);
  };

  const buildPreview = (commitRows: ImportCommitRow[], parsePreview: ParsePreviewRow[], accountHint?: string | null): PreviewTransaction[] =>
    commitRows.map((row, index) => {
      const parseRow = parsePreview.find((item) => item.commitIndex === index);
      const account = accounts.find((item) => item.id === row.accountId) ?? matchAccount(accounts, row.accountHint ?? parseRow?.accountHint ?? accountHint ?? null);
      return {
        id: String(index),
        description: row.description,
        date: row.date,
        amount: Math.abs(row.amount),
        signedAmount: row.amount,
        type: row.type ?? (row.amount >= 0 ? "income" : "expense"),
        documentType: row.documentType ?? null,
        categoryId: row.categoryId ?? null,
        account: account?.name ?? row.accountHint ?? "",
        hasError: parseRow?.status === "error",
        needsReview: Boolean(row.categoryNeedsReview || !row.categoryId)
      };
    });

  const parseFile = async (nextFile: File, mapping?: CsvMapping): Promise<void> => {
    setStep("processing");
    setErrorMessage("");
    startProgress();

    try {
      const formData = new FormData();
      formData.append("file", nextFile);
      if (mapping) {
        formData.append("mapping", JSON.stringify(compactMapping(mapping)));
      }
      const parsed = await fetchJsonOrThrow<ImportParseResponse>("/api/imports/parse", {
        method: "POST",
        body: formData
      });
      if (parsed.needsMapping) {
        const columns = parsed.columns ?? [];
        const preset = loadCsvMappingPreset(columns);
        setSourceType(parsed.sourceType);
        setCsvColumns(columns);
        setCsvSampleRows(parsed.sampleRows ?? []);
        setCsvMapping({
          ...EMPTY_MAPPING,
          ...(parsed.suggestedMapping ?? {}),
          ...(preset ?? {})
        });
        setMappingHint(parsed.mappingDiagnostics?.message ?? "Selecione as colunas para o backend interpretar o arquivo.");
        stopProgress();
        setStep("mapping");
        return;
      }
      if (mapping && parsed.sourceType === "csv") {
        saveCsvMappingPreset(parsed.columns ?? csvColumns, mapping);
      }
      setSourceType(parsed.sourceType);
      setRows(parsed.rows);
      setPreview(buildPreview(parsed.rows, parsed.preview, parsed.accountHint));
      setClosingBalance(inferClosingBalance(parsed.rows, parsed.metadata));
      setPreviewDocumentType(parsed.documentType ?? null);
      setPreviewMetadata(parsed.metadata ?? null);
      setSelectedAccountId(matchAccount(accounts, parsed.accountHint ?? null)?.id ?? "");
      setCommitResult(null);
      stopProgress();
      setStep("preview");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao processar o arquivo.");
      stopProgress(0);
      setStep(mapping ? "mapping" : "upload");
    }
  };

  const handleFile = async (nextFile: File): Promise<void> => {
    setFile(nextFile);
    setRows([]);
    setPreview([]);
    setCsvColumns([]);
    setCsvSampleRows([]);
    setCsvMapping(EMPTY_MAPPING);
    setMappingHint("");
    setPreviewDocumentType(null);
    setPreviewMetadata(null);
    await parseFile(nextFile);
  };

  const handleMappingSubmit = async (): Promise<void> => {
    if (!file) return;
    await parseFile(file, csvMapping);
  };

  const updateCategory = (id: string, categoryId: string): void => {
    const index = Number(id);
    setPreview((current) =>
      current.map((item) =>
        item.id === id ? { ...item, categoryId, hasError: false, needsReview: categoryId.length === 0 } : item
      )
    );
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              categoryId,
              categorySource: categoryId ? "manual" : null,
              categoryNeedsReview: categoryId.length === 0,
              raw: {
                ...(row.raw ?? {}),
                categorySource: categoryId ? "manual" : null,
                categorizationReviewNeeded: categoryId.length === 0
              }
            }
          : row
      )
    );
  };

  const removeRow = (id: string): void => {
    const index = Number(id);
    setPreview((current) => current.filter((item) => item.id !== id).map((item, itemIndex) => ({ ...item, id: String(itemIndex) })));
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  };

  const resolveAccountId = async (): Promise<string | undefined> => {
    if (accountMode === "existing") return selectedAccountId || undefined;
    if (accountMode === "new" && newAccountName.trim()) {
      const account = await fetchJsonOrThrow<AccountDTO>("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAccountName.trim(),
          type: "checking",
          institution: newAccountName.trim(),
          currency: "BRL",
          parentAccountId: null
        })
      });
      setAccounts((current) => [...current, account]);
      return account.id;
    }
    return selectedAccountId || undefined;
  };

  const handleCommit = async (): Promise<void> => {
    setStep("processing");
    setErrorMessage("");
    startProgress();

    try {
      const defaultAccountId = await resolveAccountId();
      const result = await fetchJsonOrThrow<ImportCommitResponse>("/api/imports/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType,
          fileName: file?.name ?? "importacao",
          defaultAccountId,
          rows
        })
      });
      setCommitResult(result);
      stopProgress();
      setStep("success");
      notifyFinanceDataChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao concluir a importacao.");
      stopProgress(0);
      setStep("preview");
    }
  };

  const total = useMemo(
    () =>
      resolveImportPreviewTotal({
        rows: preview,
        documentType: previewDocumentType,
        metadata: previewMetadata
      }),
    [preview, previewDocumentType, previewMetadata]
  );
  const mappingIsValid =
    csvMapping.date.trim().length > 0 &&
    csvMapping.description.trim().length > 0 &&
    Boolean(csvMapping.amount?.trim() || (csvMapping.debit?.trim() && csvMapping.credit?.trim()));
  const canImport =
    preview.length > 0 &&
    !preview.some((item) => item.hasError) &&
    !((accountMode === "existing" && !selectedAccountId) || (accountMode === "new" && !newAccountName.trim()));

  if (!isImportModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeImportModal} />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-6">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Importar Extrato</h2>
            <p className="mt-1 text-sm text-muted-foreground">Parse real, revisao e commit no backend existente.</p>
          </div>
          <button onClick={closeImportModal} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === "upload" ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="flex w-full max-w-xl cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-border p-12 text-center transition-all hover:border-primary/50 hover:bg-secondary" onClick={() => inputRef.current?.click()}>
                <input ref={inputRef} type="file" className="hidden" accept=".csv,.ofx,.pdf" onChange={(event) => event.target.files?.[0] && void handleFile(event.target.files[0])} />
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <UploadCloud size={40} />
                </div>
                <h3 className="mb-2 text-xl font-bold text-foreground">Selecione o extrato</h3>
                <p className="mb-8 max-w-xs text-muted-foreground">Arquivos CSV, OFX e PDF suportados pelo parser atual.</p>
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mb-4 rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
              {errorMessage}
            </div>
          ) : null}

          {step === "processing" ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Loader2 size={34} className="animate-spin" />
              </div>
              <h3 className="mb-2 text-2xl font-bold text-foreground">Processando arquivo...</h3>
              <p className="text-muted-foreground">{progress}% concluido</p>
            </div>
          ) : null}

          {step === "mapping" ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-foreground">Mapear colunas do CSV</h3>
                <p className="mt-1 text-sm text-muted-foreground">{mappingHint}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {CSV_MAPPING_FIELDS.map(({ key, label, required }) => (
                  <label key={key} className="block space-y-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {label}{required ? " *" : ""}
                    </span>
                    <select
                      value={String(csvMapping[key] ?? "")}
                      onChange={(event) => setCsvMapping((current) => ({ ...current, [key]: event.target.value }))}
                      className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none"
                    >
                      <option value="">Nao usar</option>
                      {csvColumns.map((column) => (
                        <option key={`${key}-${column}`} value={column}>
                          {column}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="border-b border-border bg-secondary px-4 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Amostra do arquivo
                </div>
                <div className="max-h-64 overflow-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-secondary/60 text-muted-foreground">
                      <tr>
                        {csvColumns.map((column) => (
                          <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {csvSampleRows.slice(0, 8).map((sample, index) => (
                        <tr key={index}>
                          {csvColumns.map((column) => (
                            <td key={`${index}-${column}`} className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                              {sample[column] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                <div className="rounded-2xl border border-info/20 bg-info/5 px-4 py-3">Valor unico: coluna com sinal.</div>
                <div className="rounded-2xl border border-info/20 bg-info/5 px-4 py-3">Debito/Credito: colunas separadas.</div>
              </div>
            </div>
          ) : null}

          {step === "preview" ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <FileText size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{file?.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {preview.length} linhas validas, resultado do arquivo {formatCurrency(total, false)}
                    {closingBalance !== null ? `, saldo final ${formatCurrency(closingBalance, false)}` : ""}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-secondary p-4">
                <div className="mb-3 text-sm font-medium text-foreground">Conta de destino</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["auto", "existing", "new"] as const).map((mode) => (
                    <button key={mode} type="button" onClick={() => setAccountMode(mode)} className={cn("rounded-xl border p-3 text-left text-sm transition-colors", accountMode === mode ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground")}>
                      {mode === "auto" ? "Automatica" : mode === "existing" ? "Existente" : "Nova conta"}
                    </button>
                  ))}
                </div>
                {accountMode === "existing" ? (
                  <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)} className="mt-3 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none">
                    <option value="">Selecione a conta...</option>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                ) : null}
                {accountMode === "new" ? (
                  <input value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} placeholder="Nome da nova conta" className="mt-3 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground" />
                ) : null}
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-secondary text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Descricao</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3">Conta</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.map((item) => (
                      <tr key={item.id} className={cn((item.hasError || item.needsReview) && "bg-warning/5")}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {item.hasError || item.needsReview ? (
                              <AlertCircle size={15} className="text-warning" />
                            ) : (
                              <CheckCircle2 size={15} className="text-success" />
                            )}
                            <div>
                              <div className="font-medium text-foreground">{item.description}</div>
                              <div className="text-xs text-muted-foreground">{formatImportDate(item.date)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", previewTypeClass(item))}>
                            {previewTypeLabel(item)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select value={item.categoryId ?? ""} onChange={(event) => updateCategory(item.id, event.target.value)} className={cn("rounded-lg border bg-card px-3 py-2 text-xs outline-none", item.hasError ? "border-warning/40 text-warning" : "border-border text-foreground")}>
                            <option value="">Selecione...</option>
                            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{item.account || "Automatico"}</td>
                        <td className={cn("px-4 py-3 text-right font-mono", previewAmountClass(item))}>{item.signedAmount >= 0 ? "+" : "-"} {formatCurrency(item.amount, false)}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => removeRow(item.id)} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-error/10 hover:text-error">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {step === "success" ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-success/20 text-success">
                <CheckCircle2 size={48} />
              </div>
              <h3 className="mb-3 text-3xl font-bold text-foreground">Importacao concluida!</h3>
              <p className="mb-3 text-muted-foreground">
                {(commitResult?.totalImported ?? preview.length)} transacoes foram importadas com sucesso.
              </p>
              {commitResult && commitResult.totalSkipped > 0 ? (
                <p className="mb-8 text-sm text-muted-foreground">
                  {commitResult.totalSkipped} linha(s) foram ignoradas ou já existiam.
                </p>
              ) : (
                <div className="mb-8" />
              )}
              <button onClick={closeImportModal} className="rounded-xl bg-primary px-8 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90">Fechar</button>
            </div>
          ) : null}
        </div>

        {step === "mapping" ? (
          <div className="border-t border-border bg-card/90 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {mappingIsValid ? "Mapeamento pronto para reprocessar no backend." : "Informe Data, Descricao e Valor ou Debito/Credito."}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep("upload")} className="rounded-xl border border-border px-6 py-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Voltar</button>
                <button onClick={() => void handleMappingSubmit()} disabled={!mappingIsValid} className="rounded-xl bg-primary px-8 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">Reprocessar</button>
              </div>
            </div>
          </div>
        ) : null}

        {step === "preview" ? (
          <div className="border-t border-border bg-card/90 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {preview.some((item) => item.hasError)
                  ? "Corrija as linhas inválidas antes de importar."
                  : preview.some((item) => item.needsReview)
                    ? "Algumas linhas ficaram sem categoria confiável; você pode importar e revisar depois."
                    : "Tudo pronto para importar."}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep("upload")} className="rounded-xl border border-border px-6 py-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancelar</button>
                <button onClick={() => void handleCommit()} disabled={!canImport} className="rounded-xl bg-primary px-8 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">Importar</button>
              </div>
            </div>
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
