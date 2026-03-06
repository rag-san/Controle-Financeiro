import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

test("import flow keeps explicit processing, success, empty and error feedback messages", () => {
  const importContent = readRepoFile("components/import/ImportTransactionsContent.tsx");

  assert.ok(
    importContent.includes('isParsing ? "Analisando arquivo..." : "Analisar arquivo"'),
    "Import parsing progress message changed."
  );
  assert.ok(
    importContent.includes('Importação concluída: {result.totalImported} novas transações e {result.totalSkipped} ignoradas.'),
    "Import success feedback changed."
  );
  assert.ok(
    importContent.includes("Nenhuma conta cadastrada"),
    "Import empty-account feedback changed."
  );
  assert.ok(
    importContent.includes('{error ? <FeedbackMessage variant="error">{error}</FeedbackMessage> : null}'),
    "Import error feedback contract changed."
  );
});
