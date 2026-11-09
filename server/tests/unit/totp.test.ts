import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpCode,
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from "../../src/lib/totp.js";

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vector (6-digit truncation)", () => {
    // RFC 6238 uses secret "12345678901234567890"; at t=59 the 8-digit code is 94287082.
    const secret = base32Encode(Buffer.from("12345678901234567890", "utf8"));
    expect(generateTotpCode(secret, 59_000)).toBe("287082");
  });

  it("round-trips base32 encoding", () => {
    const buf = Buffer.from("hello-mfa-world", "utf8");
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it("verifies codes within the clock-skew window only", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = generateTotpCode(secret, now);

    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(true);
    expect(verifyTotp(secret, code, now + 5 * 60_000)).toBe(false);
    expect(verifyTotp(secret, "000000", now)).toBe(false);
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
  });

  it("builds an otpauth URL usable by authenticator apps", () => {
    const url = otpauthUrl("JBSWY3DPEHPK3PXP", "user@example.com");
    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(url).toContain("issuer=SecureResident");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
  });
});
