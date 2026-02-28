import assert from "node:assert/strict";
import test from "node:test";

import { parseOfxBuffer } from "@/lib/ofx";

test("parseOfxBuffer classifies credit card OFX as credit_card_invoice", () => {
  const content = `
<OFX>
  <CREDITCARDMSGSRSV1>
    <CCSTMTTRNRS>
      <CCSTMTRS>
        <CCACCTFROM>
          <ACCTID>1234</ACCTID>
        </CCACCTFROM>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNAMT>-120.55
            <DTPOSTED>20260210120000
            <MEMO>Compra mercado
            <FITID>CC-1
          </STMTTRN>
        </BANKTRANLIST>
      </CCSTMTRS>
    </CCSTMTTRNRS>
  </CREDITCARDMSGSRSV1>
</OFX>
  `.trim();

  const parsed = parseOfxBuffer(Buffer.from(content, "utf8"));

  assert.equal(parsed.documentType, "credit_card_invoice");
  assert.equal(parsed.accountId, "1234");
  assert.equal(parsed.transactions.length, 1);
  assert.equal(parsed.transactions[0]?.type, "expense");
});

test("parseOfxBuffer classifies bank OFX as bank_statement", () => {
  const content = `
<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <BANKACCTFROM>
          <ACCTID>5678</ACCTID>
        </BANKACCTFROM>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNAMT>2500.00
            <DTPOSTED>20260211120000
            <MEMO>Salario
            <FITID>BK-1
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
  `.trim();

  const parsed = parseOfxBuffer(Buffer.from(content, "utf8"));

  assert.equal(parsed.documentType, "bank_statement");
  assert.equal(parsed.accountId, "5678");
  assert.equal(parsed.transactions.length, 1);
  assert.equal(parsed.transactions[0]?.type, "income");
});

