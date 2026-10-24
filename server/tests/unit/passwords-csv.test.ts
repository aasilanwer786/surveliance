import { describe, expect, it } from "vitest";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "../../src/lib/passwords.js";
import { csvResponse, toCsv } from "../../src/lib/csv.js";

describe("password policy", () => {
  it("accepts a strong password", () => {
    const result = checkPasswordPolicy("Secure@Demo123!");
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects weak passwords with helpful errors", () => {
    expect(checkPasswordPolicy("short").ok).toBe(false);
    expect(checkPasswordPolicy("alllowercase123!").errors).toContain("Must contain an uppercase letter");
    expect(checkPasswordPolicy("ALLUPPERCASE123!").errors).toContain("Must contain a lowercase letter");
    expect(checkPasswordPolicy("NoDigitsHere!!!").errors).toContain("Must contain a digit");
    expect(checkPasswordPolicy("NoSymbols12345").errors).toContain("Must contain a symbol");
    expect(checkPasswordPolicy("password123!").errors).toContain("Password is too common");
  });

  it("requires at least 10 characters", () => {
    expect(checkPasswordPolicy("Ab1!def").errors).toContain("Must be at least 10 characters long");
  });
});

describe("password hashing", () => {
  it("verifies a round-trip and rejects wrong passwords", async () => {
    const hash = await hashPassword("Secure@Demo123!");
    expect(hash).not.toContain("Secure@Demo123!");
    expect(await verifyPassword("Secure@Demo123!", hash)).toBe(true);
    expect(await verifyPassword("Wrong@Password1", hash)).toBe(false);
  });

  it("produces unique salts", async () => {
    const [a, b] = await Promise.all([hashPassword("Same@Password1"), hashPassword("Same@Password1")]);
    expect(a).not.toBe(b);
  });
});

describe("csv", () => {
  it("serializes rows with a header line", () => {
    const csv = toCsv([
      { name: "Ali", flat: "A-102", count: 3 },
      { name: "Sara", flat: "B-203", count: 1 },
    ]);
    expect(csv).toBe("name,flat,count\r\nAli,A-102,3\r\nSara,B-203,1");
  });

  it("escapes quotes, commas and newlines", () => {
    const csv = toCsv([{ note: 'He said "hi",\nand left' }]);
    expect(csv).toContain('"He said ""hi"",\nand left"');
  });

  it("renders null/undefined as empty and dates as ISO", () => {
    const csv = toCsv([{ a: null, b: undefined, c: new Date("2026-01-02T03:04:05.000Z") }]);
    expect(csv).toBe("a,b,c\r\n,,2026-01-02T03:04:05.000Z");
  });

  it("returns empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("csvResponse sets download headers", () => {
    const res = csvResponse("visitors.csv", [{ id: 1 }]);
    expect(res.headers["Content-Type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["Content-Disposition"]).toContain('filename="visitors.csv"');
    expect(res.payload).toContain("id\r\n1");
  });
});
