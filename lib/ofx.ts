import { parseMoneyInput } from "@/lib/money";
import { normalizeTransaction } from "@/lib/normalize";

export type OfxParsedTransaction = {
  date: Date;
  description: string;
  normalizedDescription: string;
  amount: number;
  type: "income" | "expense";
  externalId?: string;
  raw: Record<string, string>;
};

export type OfxParseResult = {
  accountId?: string;
  transactions: OfxParsedTransaction[];
};

function decodeBuffer(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8");
  const replacementChars = (utf8.match(/�/g) ?? []).length;
  const ratio = replacementChars / Math.max(utf8.length, 1);
  return ratio > 0.01 ? buffer.toString("latin1") : utf8;
}

function getTagValue(block: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>([^<\r\n]+)`, "i");
  const match = block.match(regex);
  return match?.[1]?.trim();
}

export function parseOfxBuffer(buffer: Buffer): OfxParseResult {
  const text = decodeBuffer(buffer);
  const accountId = getTagValue(text, "ACCTID");

  const statementBlocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  const transactions = statementBlocks
    .map((block) => {
      const amountText = getTagValue(block, "TRNAMT") ?? "0";
      const dateText =
        getTagValue(block, "DTPOSTED") ??
        getTagValue(block, "DTUSER") ??
        getTagValue(block, "DTAVAIL") ??
        "";
      const description =
        getTagValue(block, "MEMO") ?? getTagValue(block, "NAME") ?? "Lancamento OFX";

      if (!dateText) return null;

      const draft = normalizeTransaction({
        date: dateText,
        description,
        amount: parseMoneyInput(amountText)
      });

      return {
        ...draft,
        externalId: getTagValue(block, "FITID"),
        raw: {
          TRNAMT: amountText,
          DTPOSTED: dateText,
          MEMO: description,
          FITID: getTagValue(block, "FITID") ?? ""
        }
      } satisfies OfxParsedTransaction;
    })
    .filter(Boolean) as OfxParsedTransaction[];

  return {
    accountId,
    transactions
  };
}
