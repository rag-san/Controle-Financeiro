"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { FileDropzone } from "@/components/imports/FileDropzone";
import { MappingStep } from "@/components/imports/MappingStep";
import { PreviewStep } from "@/components/imports/PreviewStep";
import { RulesStep } from "@/components/imports/RulesStep";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import type { AccountDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { FormField } from "@/src/components/ui/FormField";
import { Input } from "@/src/components/ui/Input";
import { useToast } from "@/src/components/ui/ToastProvider";

type ParsedRow = {
  date: string;
  balanceAfter?: number | null;
  transactionKindRaw?: string;
  counterpartyRaw?: string;
  transactionKindNorm?: string;
  counterpartyNorm?: string;
  merchantKey?: string;
  sourceType?: "csv" | "ofx" | "pdf" | "manual";
  documentType?: string | null;
  description: string;
  normalizedDescription?: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  accountHint?: string;
  accountId?: string;
  categoryId?: string | null;
  transferToAccountId?: string;
  transferFromAccountId?: string;
  externalId?: string;
  raw?: Record<string, unknown>;
};

type PreviewRow = {
  line: number;
  commitIndex: number | null;
  status: "ok" | "ignored" | "error";
  reasonCode: string;
  reason: string;
  date: string | null;
  description: string;
  transactionKind: string;
  counterparty: string;
  merchantKey: string;
  amount: number | null;
  type: "income" | "expense" | "transfer" | null;
  accountHint?: string;
};

type MappingField =
  | "date"
  | "description"
  | "history"
  | "amount"
  | "debit"
  | "credit"
  | "type"
  | "account"
  | "balanceAfter";

type CategoryOption = {
  id: string;
  name: string;
};

type MappingConfidence = {
  overall: "alta" | "media" | "baixa";
  missingRequired: string[];
  fields: {
    date: "alta" | "media" | "baixa";
    description: "alta" | "media" | "baixa";
    amount: "alta" | "media" | "baixa";
  };
};

type ParseResponse = {
  sourceType: "csv" | "ofx" | "pdf";
  documentType?: "bank_statement" | "credit_card_invoice" | "unknown";
  issuerProfile?: string;
  metadata?: Record<string, string | number | boolean | null>;
  needsMapping: boolean;
  columns: string[];
  suggestedMapping?: Partial<Record<MappingField, string>>;
  suggestedMappingConfidence?: MappingConfidence;
  appliedMapping?: Partial<Record<MappingField, string>>;
  preview: PreviewRow[];
  rows?: ParsedRow[];
  totalRows: number;
  validRows?: number;
  ignoredRows?: number;
  errorRows?: number;
  reasons?: Record<string, number>;
  mappingDiagnostics?: {
    mappable: boolean;
    missingRequired: string[];
    message: string;
  };
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
};

export type ImportTransactionsFooterState = {
  validRows: number;
  errorRows: number;
  ignoredRows: number;
  importing: boolean;
  canImport: boolean;
  importLabel: string;
};

export type ImportTransactionsContentHandle = {
  submitImport: () => Promise<void>;
};

type ImportTransactionsContentProps = {
  accounts: AccountDTO[];
  onSuccess: () => Promise<void> | void;
  onAccountsRefresh?: () => Promise<void> | void;
  onFooterStateChange?: (state: ImportTransactionsFooterState) => void;
  showInlineCommitButton?: boolean;
  previewMaxHeightClassName?: string;
};

type ImportCommitResult = {
  totalImported: number;
  totalSkipped: number;
  duplicates?: number;
  invalidRows?: number;
  duplicateDetails?: {
    inDatabase?: number;
    inPayload?: number;
  };
  invalidDetails?: {
    missingAccount?: number;
    invalidRows?: number;
    invalidDate?: number;
    skippedCardPaymentLines?: number;
    invalidTransferRows?: number;
    creditInvoiceRowsNotRouted?: number;
  };
  totalTransfersCreated?: number;
  totalCardPaymentsDetected?: number;
  totalCardPaymentsNotConverted?: number;
  transferReviewSuggestionsCount?: number;
  transferReviewSuggestions?: Array<{
    fromAccountId: string;
    toAccountId: string;
    date: string;
    amount: number;
    confidence: number;
    description: string;
    counterpartDescription: string;
  }>;
  warnings?: string[];
  summary?: {
    imported: number;
    skipped: number;
    duplicates: number;
    invalid: number;
  };
  deterministicCategorizedCount?: number;
  aiCategorizedCount?: number;
  aiUnavailableReason?: string | null;
  importedRange?: {
    from: string;
    to: string;
  } | null;
};

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

const PDF_PARSE_UNAVAILABLE_MESSAGE =
  "Nao foi possivel ler este PDF automaticamente. Suporte atual: Inter (extrato/fatura), Mercado Pago (extrato/fatura) e Nubank (fatura). Se persistir, use CSV/OFX ou envie o layout para suporte.";
const PDF_PASSWORD_REQUIRED_MESSAGE = "Este PDF parece protegido por senha. Informe a senha e tente novamente.";

function getFileExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const index = lower.lastIndexOf(".");
  return index >= 0 ? lower.slice(index) : "";
}

function buildParseRequestSignature(
  file: File,
  overrideMapping?: Record<string, string>,
  options?: { pdfPassword?: string }
): string {
  const mappingSignature = overrideMapping ? JSON.stringify(overrideMapping) : "";
  const pdfPasswordSignature = options?.pdfPassword ?? "";
  return [file.name, String(file.size), String(file.lastModified), mappingSignature, pdfPasswordSignature].join("|");
}

function isParseSupportedFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  return extension === ".csv" || extension === ".ofx" || extension === ".pdf";
}

export const ImportTransactionsContent = forwardRef<
  ImportTransactionsContentHandle,
  ImportTransactionsContentProps
>(function ImportTransactionsContent(
  {
    accounts,
    onSuccess,
    onAccountsRefresh,
    onFooterStateChange,
    showInlineCommitButton = false,
    previewMaxHeightClassName
  },
  ref
): React.JSX.Element {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState("");
  const [parseErrorCode, setParseErrorCode] = useState("");
  const [parseData, setParseData] = useState<ParseResponse | null>(null);
  const [mapping, setMapping] = useState({
    date: "",
    description: "",
    history: "",
    amount: "",
    debit: "",
    credit: "",
    type: "",
    account: "",
    balanceAfter: ""
  });
  const [defaultAccountId, setDefaultAccountId] = useState("");
  const [applyRules, setApplyRules] = useState(true);
  const [loading, setLoading] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [showQuickAccountForm, setShowQuickAccountForm] = useState(false);
  const [createdAccounts, setCreatedAccounts] = useState<AccountDTO[]>([]);
  const [quickAccount, setQuickAccount] = useState({
    name: "",
    type: "checking" as AccountDTO["type"],
    institution: "",
    currency: "BRL",
    parentAccountId: ""
  });
  const [convertCardPaymentsToTransfer, setConvertCardPaymentsToTransfer] = useState(true);
  const [cardPaymentTargetAccountId, setCardPaymentTargetAccountId] = useState("");
  const [skipCardPaymentLines, setSkipCardPaymentLines] = useState(true);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [manualCategoryByCommitIndex, setManualCategoryByCommitIndex] = useState<Record<number, string>>({});
  const [saveRuleByCommitIndex, setSaveRuleByCommitIndex] = useState<Record<number, boolean>>({});
  const [isParsing, setIsParsing] = useState(false);
  const inFlightParseSignatureRef = useRef<string | null>(null);
  const lastCompletedParseSignatureRef = useRef<string | null>(null);
  const lastParseToastKeyRef = useRef<string | null>(null);

  const mergedAccounts = useMemo(() => {
    const byId = new Map<string, AccountDTO>();
    accounts.forEach((account) => byId.set(account.id, account));
    createdAccounts.forEach((account) => byId.set(account.id, account));
    return [...byId.values()];
  }, [accounts, createdAccounts]);
  const defaultAccount = useMemo(
    () => mergedAccounts.find((account) => account.id === defaultAccountId) ?? null,
    [defaultAccountId, mergedAccounts]
  );
  const creditAccounts = useMemo(
    () => mergedAccounts.filter((account) => account.type === "credit"),
    [mergedAccounts]
  );
  const nonCreditAccounts = useMemo(
    () => mergedAccounts.filter((account) => account.type !== "credit"),
    [mergedAccounts]
  );

  useEffect(() => {
    if (!defaultAccountId && mergedAccounts[0]) {
      setDefaultAccountId(mergedAccounts[0].id);
    }
  }, [defaultAccountId, mergedAccounts]);

  useEffect(() => {
    if (parseData?.documentType !== "credit_card_invoice") {
      return;
    }

    if (defaultAccount?.type === "credit") {
      return;
    }

    if (defaultAccount) {
      const linkedCards = creditAccounts.filter((account) => account.parentAccountId === defaultAccount.id);
      if (linkedCards.length === 1) {
        setDefaultAccountId(linkedCards[0].id);
        return;
      }
    }

    if (creditAccounts.length === 1) {
      setDefaultAccountId(creditAccounts[0].id);
    }
  }, [creditAccounts, defaultAccount, parseData?.documentType]);

  useEffect(() => {
    if (!defaultAccount || (defaultAccount.type !== "checking" && defaultAccount.type !== "cash")) {
      return;
    }

    if (cardPaymentTargetAccountId) {
      return;
    }

    const linkedCards = creditAccounts.filter((account) => account.parentAccountId === defaultAccount.id);
    if (linkedCards.length === 1) {
      setCardPaymentTargetAccountId(linkedCards[0].id);
      return;
    }

    if (creditAccounts.length === 1) {
      setCardPaymentTargetAccountId(creditAccounts[0].id);
    }
  }, [cardPaymentTargetAccountId, creditAccounts, defaultAccount]);

  useEffect(() => {
    if (quickAccount.type === "credit") {
      return;
    }

    if (quickAccount.parentAccountId) {
      setQuickAccount((previous) => ({ ...previous, parentAccountId: "" }));
    }
  }, [quickAccount.parentAccountId, quickAccount.type]);

  useEffect(() => {
    if (!showQuickAccountForm) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowQuickAccountForm(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showQuickAccountForm]);

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        const response = await fetch("/api/categories");
        const { data, errorMessage } = await parseApiResponse<Array<{ id: string; name: string }>>(response);
        if (errorMessage || !response.ok || !data) {
          return;
        }

        setCategories(
          data
            .map((item) => ({ id: item.id, name: item.name }))
            .filter((item) => Boolean(item.id && item.name))
        );
      } catch {
        // fallback silencioso no wizard
      }
    };

    void run();
  }, []);

  useEffect(() => {
    if (!parseData?.rows || parseData.rows.length === 0) {
      setManualCategoryByCommitIndex({});
      setSaveRuleByCommitIndex({});
      return;
    }

    const initialCategories: Record<number, string> = {};
    parseData.rows.forEach((row, index) => {
      if (row.categoryId) {
        initialCategories[index] = row.categoryId;
      }
    });

    setManualCategoryByCommitIndex(initialCategories);
    setSaveRuleByCommitIndex({});
  }, [parseData]);

  const commitRows = useMemo(() => parseData?.rows ?? [], [parseData]);
  const selectedFileExtension = file ? getFileExtension(file.name) : "";
  const isPdfUpload = selectedFileExtension === ".pdf";
  const needsPdfPassword = parseErrorCode === "pdf_password_required" || parseErrorCode === "pdf_password_invalid";
  const topReasonEntries = useMemo(
    () =>
      Object.entries(parseData?.reasons ?? {})
        .filter(([reason]) => reason !== "ok")
        .sort(([, first], [, second]) => second - first)
        .slice(0, 3),
    [parseData]
  );

  const steps = useMemo(() => {
    if (!file) return "upload";
    if (!parseData) return "upload";
    if (parseData.needsMapping) return "mapping";
    return "preview";
  }, [file, parseData]);

  const validRowsCount = useMemo(() => {
    if (!parseData) return 0;
    if (typeof parseData.validRows === "number") return parseData.validRows;
    return parseData.preview.filter((row) => row.status === "ok").length;
  }, [parseData]);

  const ignoredRowsCount = useMemo(() => {
    if (!parseData) return 0;
    if (typeof parseData.ignoredRows === "number") return parseData.ignoredRows;
    return parseData.preview.filter((row) => row.status === "ignored").length;
  }, [parseData]);

  const errorRowsCount = useMemo(() => {
    if (!parseData) return 0;
    if (typeof parseData.errorRows === "number") return parseData.errorRows;
    return parseData.preview.filter((row) => row.status === "error").length;
  }, [parseData]);

  const canImport = steps === "preview" && validRowsCount > 0 && !loading;
  const importLabel = validRowsCount === 1 ? "Importar 1 linha" : `Importar ${validRowsCount} linhas`;
  const shouldShowQuickAccountForm = showQuickAccountForm || mergedAccounts.length === 0;

  useEffect(() => {
    onFooterStateChange?.({
      validRows: validRowsCount,
      errorRows: errorRowsCount,
      ignoredRows: ignoredRowsCount,
      importing: loading,
      canImport,
      importLabel
    });
  }, [
    canImport,
    errorRowsCount,
    ignoredRowsCount,
    importLabel,
    loading,
    onFooterStateChange,
    validRowsCount
  ]);

  const showParseErrorToastOnce = (message: string, key: string): void => {
    if (lastParseToastKeyRef.current === key) {
      return;
    }
    lastParseToastKeyRef.current = key;
    toast({ variant: "error", title: "Falha na analise", description: message });
  };

  const parseFile = async (inputFile: File, overrideMapping?: Record<string, string>): Promise<void> => {
    if (isParsing) {
      return;
    }

    if (!isParseSupportedFile(inputFile)) {
      setParseData(null);
      const message = "Tipo de arquivo nao suportado. Use arquivos CSV, OFX ou PDF.";
      setError(message);
      showParseErrorToastOnce(message, "file_not_supported");
      return;
    }

    const requestSignature = buildParseRequestSignature(inputFile, overrideMapping, {
      pdfPassword: inputFile.name.toLowerCase().endsWith(".pdf") ? pdfPassword.trim() : ""
    });
    if (inFlightParseSignatureRef.current === requestSignature) {
      return;
    }

    if (lastCompletedParseSignatureRef.current === requestSignature && parseData) {
      return;
    }

    inFlightParseSignatureRef.current = requestSignature;
    setIsParsing(true);
    setLoading(true);
    setError("");
    setParseErrorCode("");

    try {
      const formData = new FormData();
      formData.append("file", inputFile);
      if (overrideMapping) {
        formData.append("mapping", JSON.stringify(overrideMapping));
      }
      if (inputFile.name.toLowerCase().endsWith(".pdf") && pdfPassword.trim()) {
        formData.append("pdfPassword", pdfPassword.trim());
      }

      const response = await fetch("/api/imports/parse", {
        method: "POST",
        body: formData
      });
      const { data, errorMessage } = await parseApiResponse<ParseResponse>(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!data) {
        throw new Error("Nao foi possivel interpretar a resposta de importacao.");
      }

      if (!response.ok) {
        const code = data.code ?? "parse_error";
        setParseErrorCode(code);
        const message =
          code === "pdf_password_required" || code === "pdf_password_invalid"
            ? PDF_PASSWORD_REQUIRED_MESSAGE
            : response.status === 422 && code === "source_parser_unavailable" && data.details?.sourceType === "pdf"
              ? PDF_PARSE_UNAVAILABLE_MESSAGE
            : data.message ?? "Falha ao analisar arquivo.";
        throw new Error(message);
      }

      setParseData(data);
      setParseErrorCode("");
      lastCompletedParseSignatureRef.current = requestSignature;
      lastParseToastKeyRef.current = null;

      if (data.appliedMapping) {
        setMapping((prev) => ({ ...prev, ...data.appliedMapping }));
      } else if (data.suggestedMapping) {
        setMapping((prev) => ({ ...prev, ...data.suggestedMapping }));
      }

      if (mergedAccounts.length > 0 && !defaultAccountId) {
        setDefaultAccountId(mergedAccounts[0].id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado";
      setParseData(null);
      setError(message);
      showParseErrorToastOnce(message, `${requestSignature}:${message}`);
    } finally {
      inFlightParseSignatureRef.current = null;
      setIsParsing(false);
      setLoading(false);
    }
  };

  const handleUpload = (selectedFile: File): void => {
    const extension = getFileExtension(selectedFile.name);
    const isSupported = isParseSupportedFile(selectedFile);

    setFile(selectedFile);
    setParseData(null);
    setResult(null);
    setError("");
    setParseErrorCode("");
    setIsParsing(false);
    if (extension !== ".pdf") {
      setPdfPassword("");
    }
    inFlightParseSignatureRef.current = null;
    lastCompletedParseSignatureRef.current = null;
    lastParseToastKeyRef.current = null;

    if (!isSupported) {
      const message =
        "Tipo de arquivo nao suportado. Use arquivos CSV, OFX ou PDF.";
      setError(message);
      showParseErrorToastOnce(message, `${extension || "unknown"}_not_supported`);
    }
  };

  const handleCreateAccount = async (): Promise<void> => {
    const name = quickAccount.name.trim();
    if (name.length < 2) {
      const message = "Informe um nome de conta com pelo menos 2 caracteres.";
      setError(message);
      toast({ variant: "error", title: "Conta invalida", description: message });
      return;
    }

    setCreatingAccount(true);
    setError("");

    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          type: quickAccount.type,
          institution: quickAccount.institution.trim() || null,
          currency: quickAccount.currency.toUpperCase(),
          parentAccountId: quickAccount.type === "credit" ? quickAccount.parentAccountId || null : null
        })
      });

      const { data, errorMessage } = await parseApiResponse<AccountDTO | { error?: unknown }>(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!response.ok || !data || !("id" in data)) {
        throw new Error(extractApiError(data, "Nao foi possivel criar conta."));
      }

      setCreatedAccounts((prev) => {
        const existing = prev.find((account) => account.id === data.id);
        if (existing) {
          return prev.map((account) => (account.id === data.id ? data : account));
        }
        return [...prev, data];
      });
      setDefaultAccountId(data.id);
      setQuickAccount((prev) => ({ ...prev, name: "", institution: "", parentAccountId: "" }));
      setShowQuickAccountForm(false);
      toast({ variant: "success", title: "Conta criada", description: `${data.name} pronta para uso na importacao.` });

      if (onAccountsRefresh) {
        await onAccountsRefresh();
      }

      if (file) {
        const mappingOverride = Object.fromEntries(
          Object.entries(mapping).filter(([, value]) => typeof value === "string" && value.trim().length > 0)
        ) as Record<string, string>;

        lastCompletedParseSignatureRef.current = null;
        await parseFile(file, Object.keys(mappingOverride).length > 0 ? mappingOverride : undefined);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao criar conta.";
      setError(message);
      toast({ variant: "error", title: "Falha ao criar conta", description: message });
    } finally {
      setCreatingAccount(false);
    }
  };

  const saveReusableRules = useCallback(
    async (rowsToCommit: ParsedRow[]): Promise<void> => {
      const unique = new Map<string, { categoryId: string; merchantKey: string }>();

      rowsToCommit.forEach((row, index) => {
        if (!saveRuleByCommitIndex[index]) return;
        if (!row.categoryId) return;
        if (!row.merchantKey || row.merchantKey === "transacao") return;

        const key = `${row.categoryId}|${row.merchantKey}`;
        if (!unique.has(key)) {
          unique.set(key, {
            categoryId: row.categoryId,
            merchantKey: row.merchantKey
          });
        }
      });

      if (unique.size === 0) {
        return;
      }

      for (const entry of unique.values()) {
        const response = await fetch("/api/categories/rules", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: `Import ${entry.merchantKey}`,
            priority: 50,
            enabled: true,
            matchType: "contains",
            pattern: entry.merchantKey.toUpperCase(),
            categoryId: entry.categoryId
          })
        });

        if (!response.ok) {
          throw new Error("Nao foi possivel salvar uma ou mais regras de estabelecimento.");
        }
      }
    },
    [saveRuleByCommitIndex]
  );

  const handleCommit = useCallback(async (): Promise<void> => {
    if (!file || !parseData) return;

    if (!defaultAccountId && !commitRows.some((row) => row.accountId || row.accountHint)) {
      const message = "Selecione uma conta padrao para concluir a importacao.";
      setError(message);
      toast({ variant: "error", title: "Conta obrigatoria", description: message });
      return;
    }

    setLoading(true);
    setError("");

    try {
      const rowsForCommit = commitRows.map((row, index) => ({
        ...row,
        categoryId: manualCategoryByCommitIndex[index] ?? row.categoryId ?? null
      }));

      const response = await fetch("/api/imports/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceType: parseData.sourceType,
          fileName: file.name,
          defaultAccountId: defaultAccountId || undefined,
          mapping: {
            ...mapping,
            convertCardPaymentsToTransfer,
            cardPaymentTargetAccountId: cardPaymentTargetAccountId || null,
            skipCardPaymentLines
          },
          applyRules,
          applyLocalAi: false,
          rows: rowsForCommit
        })
      });
      const { data, errorMessage } = await parseApiResponse<ImportCommitResult & { error?: string }>(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!data) {
        throw new Error("Nao foi possivel interpretar a resposta final da importacao.");
      }

      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Falha ao importar.");
      }
      let saveRuleWarning: string | null = null;
      try {
        await saveReusableRules(rowsForCommit);
      } catch (ruleError) {
        saveRuleWarning =
          ruleError instanceof Error ? ruleError.message : "Falha ao salvar regras reaproveitaveis.";
      }

      setResult({
        totalImported: data.totalImported,
        totalSkipped: data.totalSkipped,
        duplicates: data.duplicates ?? data.summary?.duplicates ?? 0,
        invalidRows: data.invalidRows ?? data.summary?.invalid ?? 0,
        totalTransfersCreated: "totalTransfersCreated" in data ? data.totalTransfersCreated ?? 0 : 0,
        totalCardPaymentsDetected:
          "totalCardPaymentsDetected" in data ? data.totalCardPaymentsDetected ?? 0 : 0,
        totalCardPaymentsNotConverted:
          "totalCardPaymentsNotConverted" in data ? data.totalCardPaymentsNotConverted ?? 0 : 0,
        warnings: "warnings" in data && Array.isArray(data.warnings) ? data.warnings : [],
        summary: data.summary,
        deterministicCategorizedCount:
          "deterministicCategorizedCount" in data ? data.deterministicCategorizedCount ?? 0 : 0,
        aiCategorizedCount: "aiCategorizedCount" in data ? data.aiCategorizedCount ?? 0 : 0,
        aiUnavailableReason: "aiUnavailableReason" in data ? data.aiUnavailableReason ?? null : null,
        importedRange: "importedRange" in data ? data.importedRange ?? null : null
      });
      toast({
        variant: "success",
        title: "Importacao concluida",
        description: `${data.totalImported} transacao(oes) importada(s).`
      });
      if (saveRuleWarning) {
        toast({
          variant: "info",
          title: "Importacao concluida com aviso",
          description: saveRuleWarning
        });
      }
      await onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado";
      setError(message);
      toast({ variant: "error", title: "Falha na importacao", description: message });
    } finally {
      setLoading(false);
    }
  }, [
    applyRules,
    cardPaymentTargetAccountId,
    commitRows,
    convertCardPaymentsToTransfer,
    defaultAccountId,
    file,
    manualCategoryByCommitIndex,
    mapping,
    onSuccess,
    parseData,
    saveReusableRules,
    skipCardPaymentLines,
    toast
  ]);

  useImperativeHandle(
    ref,
    () => ({
      submitImport: async (): Promise<void> => {
        if (!canImport) {
          return;
        }
        await handleCommit();
      }
    }),
    [canImport, handleCommit]
  );

  return (
    <Card>
      <CardHeader className="flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="h-4 w-4" />
          Importar extrato (CSV/OFX/PDF)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4" aria-busy={loading || creatingAccount}>
        {steps === "upload" ? <FileDropzone onSelect={handleUpload} /> : null}
        {steps === "upload" && file ? (
          <FeedbackMessage variant={isPdfUpload ? "warning" : "info"} className="space-y-3 p-4">
            <div className="space-y-1">
              <p className="font-medium">Arquivo selecionado: {file.name}</p>
              <p className="text-sm text-muted-foreground">
                Tamanho: {(file.size / 1024).toFixed(1)} KB | Tipo: {selectedFileExtension || "desconhecido"}
              </p>
            </div>
            {isPdfUpload ? (
              <>
                <p className="text-sm">
                  PDF sera processado automaticamente. Se estiver protegido, informe a senha antes de analisar.
                </p>
                <FormField
                  id="import-pdf-password"
                  label="Senha do PDF (opcional)"
                  hint="Usada apenas para leitura do arquivo durante o parse."
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="password"
                      value={pdfPassword}
                      onChange={(event) => setPdfPassword(event.target.value)}
                      autoComplete="off"
                    />
                  )}
                </FormField>
                {needsPdfPassword ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Senha obrigatoria ou invalida. Informe a senha correta e clique em analisar novamente.
                  </p>
                ) : null}
              </>
            ) : null}
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  if (file) {
                    void parseFile(file);
                  }
                }}
                isLoading={isParsing}
                disabled={isParsing || !file}
              >
                {isParsing ? "Analisando arquivo..." : "Analisar arquivo"}
              </Button>
            </div>
          </FeedbackMessage>
        ) : null}

        {steps === "mapping" && parseData ? (
          <MappingStep
            columns={parseData.columns}
            mapping={mapping}
            suggestedMapping={parseData.suggestedMapping as Partial<Record<MappingField, string>>}
            confidence={parseData.suggestedMappingConfidence}
            onChange={setMapping}
            onConfirm={() => {
              if (file) {
                void parseFile(file, mapping);
              }
            }}
            busy={isParsing}
          />
        ) : null}

        {steps === "preview" && parseData ? (
          <>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
              <div className="rounded-2xl border border-border/80 bg-card p-3 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold tracking-wide">Configuracao da importacao</h3>
                    <p className="text-sm text-muted-foreground">
                      Defina uma conta fallback para linhas sem conta identificada no arquivo.
                    </p>
                  </div>
                  {mergedAccounts.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowQuickAccountForm((prev) => !prev)}
                      aria-expanded={showQuickAccountForm}
                      aria-controls="quick-account-form"
                    >
                      {showQuickAccountForm ? "Fechar conta rapida" : "Criar conta rapida"}
                    </Button>
                  ) : (
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                      Nenhuma conta cadastrada
                    </span>
                  )}
                </div>

                <FormField
                  id="import-default-account"
                  label="Conta padrao (fallback)"
                  hint="Usada quando a linha importada nao indicar conta."
                  className="mt-4"
                >
                  {(fieldProps) => (
                    <Select
                      {...fieldProps}
                      value={defaultAccountId}
                      onChange={(event) => setDefaultAccountId(event.target.value)}
                    >
                      <option value="">Sem conta padrao</option>
                      {mergedAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </FormField>
              </div>

              <div className="rounded-2xl border border-border/80 bg-muted/20 p-3 sm:p-5">
                <h3 className="text-sm font-semibold tracking-wide">Resumo do arquivo</h3>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Total detectado</p>
                    <p className="mt-1 text-lg font-semibold">{parseData.totalRows}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Linhas validas</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{validRowsCount}</p>
                  </div>
                  <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Ignoradas</p>
                    <p className="mt-1 text-lg font-semibold text-amber-600 dark:text-amber-400">{ignoredRowsCount}</p>
                  </div>
                  <div className="rounded-xl border border-rose-200/70 bg-rose-50/40 p-3 dark:border-rose-900/60 dark:bg-rose-950/20">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Com erro</p>
                    <p className="mt-1 text-lg font-semibold text-rose-600 dark:text-rose-400">{errorRowsCount}</p>
                  </div>
                </div>
                <dl className="mt-4 divide-y divide-border/70 rounded-xl border border-border/70 bg-card text-sm">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <dt className="text-muted-foreground">Origem</dt>
                    <dd className="max-w-[60%] text-right font-medium break-words">{parseData.sourceType.toUpperCase()}</dd>
                  </div>
                  {parseData.documentType ? (
                    <div className="flex items-center justify-between gap-3 px-3 py-2">
                      <dt className="text-muted-foreground">Documento</dt>
                      <dd className="max-w-[60%] text-right font-medium break-words">{parseData.documentType}</dd>
                    </div>
                  ) : null}
                  {parseData.issuerProfile ? (
                    <div className="flex items-center justify-between gap-3 px-3 py-2">
                      <dt className="text-muted-foreground">Perfil detectado</dt>
                      <dd className="max-w-[60%] text-right font-medium break-words">{parseData.issuerProfile}</dd>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <dt className="text-muted-foreground">Contas disponiveis</dt>
                    <dd className="max-w-[60%] text-right font-medium break-words">{mergedAccounts.length}</dd>
                  </div>
                  {topReasonEntries.length > 0 ? (
                    <div className="px-3 py-2">
                      <dt className="text-muted-foreground">Motivos principais</dt>
                      <dd className="mt-1 text-xs text-foreground">
                        {topReasonEntries.map(([reason, count]) => `${reason} (${count})`).join(", ")}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </section>

            {parseData.documentType === "credit_card_invoice" && defaultAccount?.type !== "credit" ? (
              <FeedbackMessage variant="warning" className="space-y-2 p-4">
                <p className="font-semibold">Fatura de cartao detectada</p>
                <p>
                  Selecione uma conta do tipo cartao de credito para manter os lancamentos separados da conta
                  corrente. Se nao existir conta de cartao para a instituicao, o sistema tentara criar uma conta
                  vinculada automaticamente.
                </p>
              </FeedbackMessage>
            ) : null}

            {(defaultAccount?.type === "checking" || defaultAccount?.type === "cash") && creditAccounts.length > 0 ? (
              <section className="space-y-3 rounded-2xl border border-border/80 bg-card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="convert-card-payment-transfer"
                    checked={convertCardPaymentsToTransfer}
                    onChange={(event) => setConvertCardPaymentsToTransfer(Boolean(event.target.checked))}
                  />
                  <div>
                    <label htmlFor="convert-card-payment-transfer" className="font-medium">
                      Converter pagamentos de fatura em transferencia para cartao
                    </label>
                    <p className="text-sm text-muted-foreground">
                      O debito sai da conta corrente e entra na conta de cartao sem gerar despesa duplicada.
                    </p>
                  </div>
                </div>

                {convertCardPaymentsToTransfer ? (
                  <FormField
                    id="card-payment-target-account"
                    label="Conta cartao destino (opcional)"
                    hint="Se vazio, o sistema tenta inferir automaticamente pelo vinculo da conta mãe."
                    className="sm:max-w-xl"
                  >
                    {(fieldProps) => (
                      <Select
                        {...fieldProps}
                        value={cardPaymentTargetAccountId}
                        onChange={(event) => setCardPaymentTargetAccountId(event.target.value)}
                      >
                        <option value="">Inferir automaticamente</option>
                        {creditAccounts.map((account) => {
                          const parent = account.parentAccountId
                            ? nonCreditAccounts.find((item) => item.id === account.parentAccountId)
                            : null;
                          const parentLabel = parent ? ` (Conta mãe: ${parent.name})` : "";
                          return (
                            <option key={account.id} value={account.id}>
                              {account.name}
                              {parentLabel}
                            </option>
                          );
                        })}
                      </Select>
                    )}
                  </FormField>
                ) : null}
              </section>
            ) : null}

            {defaultAccount?.type === "credit" ? (
              <section className="space-y-3 rounded-2xl border border-border/80 bg-card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="skip-card-payment-lines"
                    checked={skipCardPaymentLines}
                    onChange={(event) => setSkipCardPaymentLines(Boolean(event.target.checked))}
                  />
                  <div>
                    <label htmlFor="skip-card-payment-lines" className="font-medium">
                      Ignorar linhas de pagamento na fatura do cartao
                    </label>
                    <p className="text-sm text-muted-foreground">
                      Evita importar o credito de pagamento da fatura e duplicar com o extrato da conta corrente.
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            {shouldShowQuickAccountForm ? (
              <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 sm:p-5" role="status">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold tracking-wide">Conta rapida para importacao</h3>
                    <p className="text-sm text-muted-foreground">
                      {mergedAccounts.length === 0
                        ? "Nenhuma conta encontrada. Crie uma conta para continuar a importacao."
                        : "Crie uma nova conta sem sair do fluxo de importacao."}
                    </p>
                  </div>
                  {mergedAccounts.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowQuickAccountForm(false)}
                    >
                      Ocultar formulario
                    </Button>
                  ) : null}
                </div>
                <form
                  id="quick-account-form"
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleCreateAccount();
                  }}
                  aria-busy={creatingAccount}
                >
                  <FormField id="quick-account-name" label="Nome da conta" required className="xl:col-span-4">
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        value={quickAccount.name}
                        onChange={(event) => setQuickAccount((prev) => ({ ...prev, name: event.target.value }))}
                      />
                    )}
                  </FormField>
                  <FormField id="quick-account-type" label="Tipo" required className="xl:col-span-3">
                    {(fieldProps) => (
                      <Select
                        {...fieldProps}
                        value={quickAccount.type}
                        onChange={(event) =>
                          setQuickAccount((prev) => ({ ...prev, type: event.target.value as AccountDTO["type"] }))
                        }
                      >
                        <option value="checking">Conta corrente</option>
                        <option value="credit">Cartao de credito</option>
                        <option value="cash">Dinheiro</option>
                        <option value="investment">Investimento</option>
                      </Select>
                    )}
                  </FormField>
                  <FormField id="quick-account-institution" label="Instituicao" className="xl:col-span-3">
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        value={quickAccount.institution}
                        onChange={(event) =>
                          setQuickAccount((prev) => ({ ...prev, institution: event.target.value }))
                        }
                      />
                    )}
                  </FormField>
                  <FormField id="quick-account-currency" label="Moeda" required className="xl:col-span-2">
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        value={quickAccount.currency}
                        onChange={(event) =>
                          setQuickAccount((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))
                        }
                      />
                    )}
                  </FormField>
                  {quickAccount.type === "credit" ? (
                    <FormField
                      id="quick-account-parent"
                      label="Conta mae (opcional)"
                      hint="Vincule a conta de cartao a uma conta corrente para conciliacao automatica."
                      className="md:col-span-2 xl:col-span-6"
                    >
                      {(fieldProps) => (
                        <Select
                          {...fieldProps}
                          value={quickAccount.parentAccountId}
                          onChange={(event) =>
                            setQuickAccount((prev) => ({ ...prev, parentAccountId: event.target.value }))
                          }
                        >
                          <option value="">Sem conta mae</option>
                          {nonCreditAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </FormField>
                  ) : null}
                  <div className="md:col-span-2 xl:col-span-12 flex flex-wrap justify-end gap-2">
                    <Button type="submit" isLoading={creatingAccount} disabled={creatingAccount} className="min-w-32">
                      {creatingAccount ? "Criando..." : "Criar conta"}
                    </Button>
                  </div>
                </form>
              </section>
            ) : null}

            <RulesStep
              applyRules={applyRules}
              onToggleRules={setApplyRules}
            />
            <PreviewStep
              rows={parseData.preview}
              categories={categories}
              manualCategoryByCommitIndex={manualCategoryByCommitIndex}
              saveRuleByCommitIndex={saveRuleByCommitIndex}
              maxHeightClassName={previewMaxHeightClassName}
              onCategoryChange={(commitIndex, categoryId) => {
                if (commitIndex < 0) return;
                setManualCategoryByCommitIndex((previous) => ({
                  ...previous,
                  [commitIndex]: categoryId
                }));
                if (!categoryId) {
                  setSaveRuleByCommitIndex((previous) => {
                    const next = { ...previous };
                    delete next[commitIndex];
                    return next;
                  });
                }
              }}
              onSaveRuleChange={(commitIndex, value) => {
                if (commitIndex < 0) return;
                setSaveRuleByCommitIndex((previous) => ({
                  ...previous,
                  [commitIndex]: value
                }));
              }}
            />

            {showInlineCommitButton && steps === "preview" ? (
              <div className="flex justify-end">
                <Button
                  onClick={handleCommit}
                  isLoading={loading}
                  disabled={!canImport}
                  className="w-full sm:w-auto"
                >
                  {loading ? "Importando..." : importLabel}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {result ? (
          <FeedbackMessage variant="success" className="space-y-1 p-4">
            <p>
              Importacao concluida: {result.totalImported} novas transacoes e {result.totalSkipped} ignoradas.
            </p>
            <p className="text-muted-foreground">
              Dica: voce pode ajustar mapeamento/conta destino e importar novamente o mesmo preview.
            </p>
            {typeof result.duplicates === "number" ? <p>Duplicadas: {result.duplicates}</p> : null}
            {typeof result.invalidRows === "number" ? <p>Inválidas: {result.invalidRows}</p> : null}
            {result.duplicateDetails ? (
              <p className="text-muted-foreground">
                Duplicadas (detalhe): banco={result.duplicateDetails.inDatabase ?? 0} | payload=
                {result.duplicateDetails.inPayload ?? 0}
              </p>
            ) : null}
            {result.invalidDetails ? (
              <p className="text-muted-foreground">
                Invalidas (detalhe): sem conta={result.invalidDetails.missingAccount ?? 0} | linha invalida=
                {result.invalidDetails.invalidRows ?? 0} | data invalida={result.invalidDetails.invalidDate ?? 0} |
                pagamento ignorado={result.invalidDetails.skippedCardPaymentLines ?? 0}
              </p>
            ) : null}
            {typeof result.totalTransfersCreated === "number" && result.totalTransfersCreated > 0 ? (
              <p>Transferencias criadas: {result.totalTransfersCreated}</p>
            ) : null}
            {typeof result.transferReviewSuggestionsCount === "number" && result.transferReviewSuggestionsCount > 0 ? (
              <p>Sugestoes de conciliacao de transferencia: {result.transferReviewSuggestionsCount}</p>
            ) : null}
            {Array.isArray(result.transferReviewSuggestions) && result.transferReviewSuggestions.length > 0 ? (
              <div className="space-y-1 text-muted-foreground">
                {result.transferReviewSuggestions.slice(0, 3).map((suggestion, index) => (
                  <p key={`review-suggestion-${index}`}>
                    Revisar transferencia {index + 1}: {suggestion.date} | R$ {suggestion.amount.toFixed(2)} | conf{" "}
                    {Math.round(suggestion.confidence * 100)}% | {suggestion.description} {"<->"}{" "}
                    {suggestion.counterpartDescription}
                  </p>
                ))}
              </div>
            ) : null}
            {typeof result.totalCardPaymentsDetected === "number" && result.totalCardPaymentsDetected > 0 ? (
              <p>Pagamentos de fatura detectados: {result.totalCardPaymentsDetected}</p>
            ) : null}
            {typeof result.totalCardPaymentsNotConverted === "number" &&
            result.totalCardPaymentsNotConverted > 0 ? (
              <p>
                Pagamentos não convertidos: {result.totalCardPaymentsNotConverted}. Selecione um cartão destino e
                importe novamente.
              </p>
            ) : null}
            {typeof result.deterministicCategorizedCount === "number" && result.deterministicCategorizedCount > 0 ? (
              <p>Categorizacao deterministica aplicada em {result.deterministicCategorizedCount} transacoes.</p>
            ) : null}
            {result.importedRange ? (
              <p>
                Periodo importado: {formatShortDate(result.importedRange.from)} ate{" "}
                {formatShortDate(result.importedRange.to)}.
              </p>
            ) : null}
            {result.aiUnavailableReason ? <p className="text-amber-700 dark:text-amber-300">{result.aiUnavailableReason}</p> : null}
            {Array.isArray(result.warnings) && result.warnings.length > 0
              ? result.warnings.map((warning, index) => (
                  <p key={`warning-${index}`} className="text-amber-700 dark:text-amber-300">
                    {warning}
                  </p>
                ))
              : null}
          </FeedbackMessage>
        ) : null}

        {error ? <FeedbackMessage variant="error">{error}</FeedbackMessage> : null}
      </CardContent>
    </Card>
  );
});

ImportTransactionsContent.displayName = "ImportTransactionsContent";

