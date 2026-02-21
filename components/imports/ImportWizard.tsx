"use client";

import { useEffect, useMemo, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  description: string;
  amount: number;
  type: "income" | "expense";
  accountHint?: string;
  accountId?: string;
  categoryId?: string | null;
  externalId?: string;
  raw?: Record<string, string>;
};

type ParseResponse = {
  sourceType: "csv" | "ofx" | "pdf";
  needsMapping: boolean;
  columns: string[];
  suggestedMapping?: Record<string, string>;
  appliedMapping?: Record<string, string>;
  preview: ParsedRow[];
  rows?: ParsedRow[];
  totalRows: number;
  validRows?: number;
};

type ImportWizardProps = {
  accounts: AccountDTO[];
  onSuccess: () => void;
  onAccountsRefresh?: () => Promise<void> | void;
};

type ImportCommitResult = {
  totalImported: number;
  totalSkipped: number;
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

export function ImportWizard({ accounts, onSuccess, onAccountsRefresh }: ImportWizardProps): React.JSX.Element {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parseData, setParseData] = useState<ParseResponse | null>(null);
  const [mapping, setMapping] = useState({
    date: "",
    description: "",
    amount: "",
    debit: "",
    credit: "",
    type: "",
    account: ""
  });
  const [defaultAccountId, setDefaultAccountId] = useState("");
  const [applyRules, setApplyRules] = useState(true);
  const [applyLocalAi, setApplyLocalAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [showQuickAccountForm, setShowQuickAccountForm] = useState(false);
  const [createdAccounts, setCreatedAccounts] = useState<AccountDTO[]>([]);
  const [quickAccount, setQuickAccount] = useState({
    name: "",
    type: "checking" as AccountDTO["type"],
    institution: "",
    currency: "BRL"
  });
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [error, setError] = useState("");

  const mergedAccounts = useMemo(() => {
    const byId = new Map<string, AccountDTO>();
    accounts.forEach((account) => byId.set(account.id, account));
    createdAccounts.forEach((account) => byId.set(account.id, account));
    return [...byId.values()];
  }, [accounts, createdAccounts]);

  useEffect(() => {
    if (!defaultAccountId && mergedAccounts[0]) {
      setDefaultAccountId(mergedAccounts[0].id);
    }
  }, [defaultAccountId, mergedAccounts]);

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

  const effectiveRows = parseData?.rows ?? parseData?.preview ?? [];

  const steps = useMemo(() => {
    if (!file) return "upload";
    if (!parseData) return "upload";
    if (parseData.needsMapping) return "mapping";
    if (!result) return "preview";
    return "done";
  }, [file, parseData, result]);

  const parseFile = async (inputFile: File, overrideMapping?: Record<string, string>): Promise<void> => {
    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", inputFile);
      if (overrideMapping) {
        formData.append("mapping", JSON.stringify(overrideMapping));
      }

      const response = await fetch("/api/imports/parse", {
        method: "POST",
        body: formData
      });
      const { data, errorMessage } = await parseApiResponse<ParseResponse & { error?: string; message?: string }>(
        response
      );

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!data) {
        throw new Error("Nao foi possivel interpretar a resposta de importacao.");
      }

      if (!response.ok) {
        throw new Error(data.error ?? data.message ?? "Falha ao analisar arquivo");
      }

      setParseData(data);

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
      setError(message);
      toast({ variant: "error", title: "Falha na analise", description: message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (selectedFile: File): Promise<void> => {
    setFile(selectedFile);
    setResult(null);
    setError("");
    await parseFile(selectedFile);
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
          currency: quickAccount.currency.toUpperCase()
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
      setQuickAccount((prev) => ({ ...prev, name: "", institution: "" }));
      setShowQuickAccountForm(false);
      toast({ variant: "success", title: "Conta criada", description: `${data.name} pronta para uso na importacao.` });

      if (onAccountsRefresh) {
        await onAccountsRefresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao criar conta.";
      setError(message);
      toast({ variant: "error", title: "Falha ao criar conta", description: message });
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleCommit = async (): Promise<void> => {
    if (!file || !parseData) return;

    if (!defaultAccountId && !effectiveRows.some((row) => row.accountId || row.accountHint)) {
      const message = "Selecione uma conta padrao para concluir a importacao.";
      setError(message);
      toast({ variant: "error", title: "Conta obrigatoria", description: message });
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/imports/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceType: parseData.sourceType,
          fileName: file.name,
          defaultAccountId: defaultAccountId || undefined,
          mapping,
          applyRules,
          applyLocalAi,
          rows: effectiveRows
        })
      });
      const { data, errorMessage } = await parseApiResponse<
        | {
            totalImported: number;
            totalSkipped: number;
            aiCategorizedCount?: number;
            aiUnavailableReason?: string | null;
            importedRange?: ImportCommitResult["importedRange"];
            error?: string;
          }
        | { error: string }
      >(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!data) {
        throw new Error("Nao foi possivel interpretar a resposta final da importacao.");
      }

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Falha ao importar");
      }

      setResult({
        totalImported: data.totalImported,
        totalSkipped: data.totalSkipped,
        aiCategorizedCount: "aiCategorizedCount" in data ? data.aiCategorizedCount ?? 0 : 0,
        aiUnavailableReason: "aiUnavailableReason" in data ? data.aiUnavailableReason ?? null : null,
        importedRange: "importedRange" in data ? data.importedRange ?? null : null
      });
      toast({
        variant: "success",
        title: "Importacao concluida",
        description: `${data.totalImported} transacao(oes) importada(s).`
      });
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado";
      setError(message);
      toast({ variant: "error", title: "Falha na importacao", description: message });
    } finally {
      setLoading(false);
    }
  };

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

        {steps === "mapping" && parseData ? (
          <MappingStep
            columns={parseData.columns}
            mapping={mapping}
            onChange={setMapping}
            onConfirm={() => {
              if (file) {
                void parseFile(file, mapping);
              }
            }}
          />
        ) : null}

        {(steps === "preview" || steps === "done") && parseData ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField id="import-default-account" label="Conta padrao (fallback)" hint="Usada quando a linha importada nao indicar conta.">
                {(fieldProps) => (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">Selecione uma conta para complementar dados faltantes.</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowQuickAccountForm((prev) => !prev)}
                        aria-expanded={showQuickAccountForm}
                        aria-controls="quick-account-form"
                      >
                        {showQuickAccountForm ? "Fechar" : "Criar conta"}
                      </Button>
                    </div>
                    <Select {...fieldProps} value={defaultAccountId} onChange={(event) => setDefaultAccountId(event.target.value)}>
                      <option value="">Sem conta padrao</option>
                      {mergedAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </FormField>

              <FeedbackMessage variant="info">
                <p>Total detectado: {parseData.totalRows} linhas</p>
                {typeof parseData.validRows === "number" ? <p>Linhas validas: {parseData.validRows}</p> : null}
                <p>Tipo de origem: {parseData.sourceType.toUpperCase()}</p>
                <p>Contas disponiveis: {mergedAccounts.length}</p>
              </FeedbackMessage>
            </div>

            {showQuickAccountForm || mergedAccounts.length === 0 ? (
              <FeedbackMessage variant="warning" className="space-y-3 p-4" role="status">
                <p className="font-medium">
                  {mergedAccounts.length === 0
                    ? "Nenhuma conta encontrada. Crie uma conta rapida para continuar a importacao."
                    : "Crie uma conta rapida sem sair do fluxo de importacao."}
                </p>
                <form
                  id="quick-account-form"
                  className="grid gap-3 md:grid-cols-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleCreateAccount();
                  }}
                  aria-busy={creatingAccount}
                >
                  <FormField id="quick-account-name" label="Nome da conta" required>
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        value={quickAccount.name}
                        onChange={(event) => setQuickAccount((prev) => ({ ...prev, name: event.target.value }))}
                      />
                    )}
                  </FormField>
                  <FormField id="quick-account-type" label="Tipo" required>
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
                  <FormField id="quick-account-institution" label="Instituicao">
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
                  <FormField id="quick-account-currency" label="Moeda" required>
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
                  <div className="flex items-end">
                    <Button type="submit" isLoading={creatingAccount} disabled={creatingAccount} className="w-full md:w-auto">
                      {creatingAccount ? "Criando..." : "Criar conta"}
                    </Button>
                  </div>
                </form>
              </FeedbackMessage>
            ) : null}

            <RulesStep
              applyRules={applyRules}
              onToggleRules={setApplyRules}
              applyLocalAi={applyLocalAi}
              onToggleLocalAi={setApplyLocalAi}
            />
            <PreviewStep rows={parseData.preview} />

            {steps === "preview" ? (
              <div className="flex justify-end">
                <Button onClick={handleCommit} isLoading={loading} disabled={loading} className="w-full sm:w-auto">
                  {loading ? "Importando..." : "Confirmar importacao"}
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
            {typeof result.aiCategorizedCount === "number" && result.aiCategorizedCount > 0 ? (
              <p>IA local categorizou {result.aiCategorizedCount} transacoes sem regra.</p>
            ) : null}
            {result.importedRange ? (
              <p>
                Periodo importado: {formatShortDate(result.importedRange.from)} ate{" "}
                {formatShortDate(result.importedRange.to)}.
              </p>
            ) : null}
            {result.aiUnavailableReason ? <p className="text-amber-700 dark:text-amber-300">{result.aiUnavailableReason}</p> : null}
          </FeedbackMessage>
        ) : null}

        {error ? <FeedbackMessage variant="error">{error}</FeedbackMessage> : null}
      </CardContent>
    </Card>
  );
}

