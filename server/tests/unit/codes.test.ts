import { describe, expect, it } from "vitest";
import {
  generateAlertCode,
  generateIncidentCode,
  generateVisitorCode,
  normalizeVisitorCode,
  qrPayloadForCode,
  randomCode,
  randomToken,
  safeEquals,
  sha256,
} from "../../src/lib/codes.js";

describe("generateVisitorCode", () => {
  it("formats VIS-YYYY-XXXXXX", () => {
    const code = generateVisitorCode(new Date(Date.UTC(2026, 0, 5)));
    expect(code).toMatch(/^VIS-2026-[A-Z2-9]{6}$/);
  });

  it("excludes ambiguous characters", () => {
    for (let i = 0; i < 50; i++) {
      const suffix = generateVisitorCode().slice("VIS-YYYY-".length);
      expect(suffix).not.toMatch(/[01ILO]/);
      expect(suffix).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    }
  });

  it("is unique across draws", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateVisitorCode()));
    expect(codes.size).toBe(100);
  });
});

describe("alert and incident codes", () => {
  it("formats alert codes with date", () => {
    expect(generateAlertCode(new Date(Date.UTC(2026, 11, 31)))).toMatch(/^ALT-20261231-[A-Z0-9]{5}$/);
  });

  it("formats incident codes with date", () => {
    expect(generateIncidentCode(new Date(Date.UTC(2026, 0, 1)))).toMatch(/^INC-20260101-[A-Z0-9]{5}$/);
  });
});

describe("normalizeVisitorCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeVisitorCode("  vis-2026-abc123 ")).toBe("VIS-2026-ABC123");
  });

  it("strips the SVC: QR prefix", () => {
    expect(normalizeVisitorCode("SVC:vis-2026-abc123")).toBe("VIS-2026-ABC123");
  });

  it("strips the SVC1: prefix", () => {
    expect(normalizeVisitorCode("SVC1:VIS-2026-ABC123")).toBe("VIS-2026-ABC123");
  });

  it("round-trips qrPayloadForCode", () => {
    const code = generateVisitorCode();
    expect(normalizeVisitorCode(qrPayloadForCode(code))).toBe(code);
  });
});

describe("safeEquals / sha256 / randomToken", () => {
  it("compares safely", () => {
    expect(safeEquals("abc", "abc")).toBe(true);
    expect(safeEquals("abc", "abd")).toBe(false);
    expect(safeEquals("abc", "abcd")).toBe(false);
  });

  it("hashes deterministically", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });

  it("generates url-safe tokens", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("randomCode respects the alphabet", () => {
    const alphabet = "XYZ";
    const code = randomCode(20, alphabet);
    expect(code).toMatch(/^[XYZ]{20}$/);
  });
});
