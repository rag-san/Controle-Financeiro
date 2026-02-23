import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSourceParserUnavailableError,
  isSupportedImportSourceType,
  SUPPORTED_IMPORT_SOURCE_TYPES
} from "../../lib/server/import-parse-registry";

test("registry returns structured 422 for unsupported sourceType", () => {
  const result = buildSourceParserUnavailableError("qif");

  assert.equal(result.status, 422);
  assert.equal(result.error.code, "source_parser_unavailable");
  assert.equal(result.error.message, "Parser not available for sourceType=qif");
  assert.deepEqual(result.error.details, {
    sourceType: "qif",
    supported: SUPPORTED_IMPORT_SOURCE_TYPES
  });
});

test("registry supports csv, ofx and pdf", () => {
  assert.equal(isSupportedImportSourceType("csv"), true);
  assert.equal(isSupportedImportSourceType("ofx"), true);
  assert.equal(isSupportedImportSourceType("pdf"), true);
  assert.equal(isSupportedImportSourceType("qif"), false);
});
