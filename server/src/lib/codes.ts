import { randomInt, randomBytes, createHash, timingSafeEqual } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SHORT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

export function randomCode(length: number, alphabet: string = CODE_ALPHABET): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[randomInt(0, alphabet.length)];
  }
  return out;
}

export function generateVisitorCode(date: Date = new Date()): string {
  return `VIS-${date.getUTCFullYear()}-${randomCode(6)}`;
}

export function generateAlertCode(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `ALT-${y}${m}${d}-${randomCode(5, SHORT_ALPHABET)}`;
}

export function generateIncidentCode(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `INC-${y}${m}${d}-${randomCode(5, SHORT_ALPHABET)}`;
}

export function normalizeVisitorCode(input: string): string {
  let code = input.trim().toUpperCase();
  if (code.startsWith("SVC:")) code = code.slice(4);
  if (code.startsWith("SVC1:")) code = code.slice(5);
  return code;
}

export const QR_PREFIX = "SVC:";

export function qrPayloadForCode(code: string): string {
  return `${QR_PREFIX}${code}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
