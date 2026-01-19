import { useEffect, useState } from "react";
import type { Transaction } from "../utils/transactions";
import {
  detectDelimiterFromLine,
  guessColumnIndex,
  makeSignature,
  normalizeSpaces,
  parseAmount,
  pickHeaderLineIndex,
  splitCSVLine,
  toISODate,
} from "../utils/transactions";

type ImportStatus = "idle" | "reading" | "mapping" | "ready" | "error";

type UseCsvImportParams = {
  existingTransactions: Transaction[];
  onImport: (transactions: Transaction[]) => void;
};

export function useCsvImport({
  existingTransactions,
  onImport,
}: UseCsvImportParams) {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importError, setImportError] = useState<string>("");

  const [csvDelimiter, setCsvDelimiter] = useState<"," | ";">(";");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);

  const [mapDateIdx, setMapDateIdx] = useState<number>(-1);
  const [mapDescIdx, setMapDescIdx] = useState<number>(-1);
  const [mapValueIdx, setMapValueIdx] = useState<number>(-1);

  const [importPreview, setImportPreview] = useState<Transaction[]>([]);

  function resetImportState() {
    setImportPreview([]);
    setImportStatus("idle");
    setImportError("");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapDateIdx(-1);
    setMapDescIdx(-1);
    setMapValueIdx(-1);
  }

  async function handleCSVFile(file: File | null) {
    if (!file) return;

    setImportError("");
    setImportStatus("reading");
    setImportPreview([]);
    setCsvHeaders([]);
    setCsvRows([]);
    setMapDateIdx(-1);
    setMapDescIdx(-1);
    setMapValueIdx(-1);

    try {
      const text = await file.text();

      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        throw new Error("CSV com poucas linhas. Precisa ter header + dados.");
      }

      // Delimitador pelo primeiro pedaço do arquivo
      const delimiter = detectDelimiterFromLine(lines[0]);
      setCsvDelimiter(delimiter);

      // Acha o header verdadeiro (ignora "Extrato Conta Corrente" e similares)
      const headerIdx = pickHeaderLineIndex(lines, delimiter);

      const headers = splitCSVLine(lines[headerIdx], delimiter).map((h) =>
        normalizeSpaces(h)
      );

      const rows = lines
        .slice(headerIdx + 1)
        .map((line) => splitCSVLine(line, delimiter))
        .filter((r) => r.filter((c) => c.trim()).length >= 3);

      setCsvHeaders(headers);
      setCsvRows(rows);

      // sugestões automáticas
      const guessDate = guessColumnIndex(headers, "date");
      const guessDesc = guessColumnIndex(headers, "desc");
      const guessValue = guessColumnIndex(headers, "value");

      setMapDateIdx(guessDate >= 0 ? guessDate : 0);
      setMapDescIdx(
        guessDesc >= 0 ? guessDesc : Math.min(1, headers.length - 1)
      );
      setMapValueIdx(
        guessValue >= 0 ? guessValue : Math.min(2, headers.length - 1)
      );

      setImportStatus("mapping");
    } catch (e) {
      setImportStatus("error");
      setImportError(e instanceof Error ? e.message : "Erro ao ler CSV");
    }
  }

  useEffect(() => {
    if (importStatus !== "mapping" && importStatus !== "ready") return;
    if (csvHeaders.length === 0 || csvRows.length === 0) return;
    if (mapDateIdx < 0 || mapDescIdx < 0 || mapValueIdx < 0) return;

    const preview: Transaction[] = [];

    for (let i = 0; i < csvRows.length; i++) {
      const cols = csvRows[i];
      const rawDate = cols[mapDateIdx] ?? "";
      const rawDesc = cols[mapDescIdx] ?? "";
      const rawValue = cols[mapValueIdx] ?? "";

      const isoDate = toISODate(rawDate);
      const amt = parseAmount(rawValue);

      if (!isoDate || amt === null) continue;

      const txType = amt >= 0 ? "entrada" : "saida";

      preview.push({
        id: crypto.randomUUID(),
        type: txType,
        title: normalizeSpaces(rawDesc) || "Sem descrição",
        amount: Math.abs(amt),
        date: isoDate,
        category: "Outros",
      });

      if (preview.length >= 200) break;
    }

    setImportPreview(preview);
    setImportStatus(preview.length > 0 ? "ready" : "mapping");
  }, [csvHeaders, csvRows, importStatus, mapDateIdx, mapDescIdx, mapValueIdx]);

  function importPreviewIntoApp() {
    if (importPreview.length === 0) {
      alert("Prévia vazia. Ajuste o mapeamento (Data/Descrição/Valor).");
      return;
    }

    const existing = new Set(
      existingTransactions.map((t) =>
        makeSignature({
          date: t.date,
          title: t.title,
          amount: t.amount,
          type: t.type,
          category: t.category,
        })
      )
    );

    const toAdd: Transaction[] = [];
    for (const t of importPreview) {
      const sig = makeSignature({
        date: t.date,
        title: t.title,
        amount: t.amount,
        type: t.type,
        category: t.category,
      });
      if (!existing.has(sig)) {
        existing.add(sig);
        toAdd.push(t);
      }
    }

    if (toAdd.length === 0) {
      alert("Nada novo para importar (evitei duplicadas).");
      return;
    }

    onImport(toAdd);
    alert(`Importei ${toAdd.length} transações!`);

    setIsImportOpen(false);
    resetImportState();
  }

  function closeImport() {
    setIsImportOpen(false);
    resetImportState();
  }

  return {
    isImportOpen,
    setIsImportOpen,
    importStatus,
    importError,
    csvDelimiter,
    csvHeaders,
    mapDateIdx,
    mapDescIdx,
    mapValueIdx,
    importPreview,
    setMapDateIdx,
    setMapDescIdx,
    setMapValueIdx,
    handleCSVFile,
    importPreviewIntoApp,
    closeImport,
  };
}
