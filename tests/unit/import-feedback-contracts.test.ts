import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

test("import modal keeps explicit processing, success and error feedback messages", () => {
  const importContent = readRepoFile("src/features/transactions/components/ImportTransactionsModal.tsx");

  assert.ok(
    importContent.includes("Importar Extrato"),
    "Import modal title changed."
  );
  assert.ok(
    importContent.includes("Adicione múltiplas transações de uma vez"),
    "Import modal subtitle changed."
  );
  assert.ok(
    importContent.includes("Arraste seu extrato aqui"),
    "Import dropzone guidance changed."
  );
  assert.ok(
    importContent.includes("Erro ao analisar arquivo"),
    "Import parse error feedback changed."
  );
  assert.ok(
    importContent.includes("Importação Concluída!"),
    "Import success feedback changed."
  );
  assert.ok(
    importContent.includes("Erro ao importar transações"),
    "Import commit error feedback changed."
  );
  assert.ok(
    importContent.includes("Nome da nova conta (Ex: Nubank Principal)"),
    "Import new-account prompt changed."
  );
});
