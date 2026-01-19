import { describe, expect, it } from "vitest";
import {
  buildTransactionsCsv,
  parseAmount,
  toISODate,
} from "./transactions";

describe("parseAmount", () => {
  it("parses Brazilian formatted values", () => {
    expect(parseAmount("1.234,56")).toBeCloseTo(1234.56);
    expect(parseAmount("R$ 99,90")).toBeCloseTo(99.9);
  });

  it("handles dot decimal values", () => {
    expect(parseAmount("2500.75")).toBeCloseTo(2500.75);
  });

  it("returns null for invalid input", () => {
    expect(parseAmount("")).toBeNull();
  });
});

describe("toISODate", () => {
  it("accepts ISO and BR formats", () => {
    expect(toISODate("2024-01-20")).toBe("2024-01-20");
    expect(toISODate("20/01/2024")).toBe("2024-01-20");
  });
});

describe("buildTransactionsCsv", () => {
  it("creates a header and lines", () => {
    const csv = buildTransactionsCsv([
      {
        id: "1",
        type: "entrada",
        title: "Salário",
        amount: 5000,
        date: "2024-01-05",
        category: "Salário",
      },
    ]);

    expect(csv.split("\n")[0]).toContain("Descrição");
    expect(csv).toContain("2024-01-05");
  });
});
