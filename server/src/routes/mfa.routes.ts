import type { FastifyInstance } from "fastify";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../db.js";
import { AppError, badRequest, conflict, unauthorized } from "../lib/errors.js";
import { verifyPassword } from "../lib/passwords.js";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "../lib/totp.js";
import { randomCode, sha256 } from "../lib/codes.js";
import { issueTokens } from "../lib/tokens.js";
import { writeAudit, auditFromRequest } from "../lib/audit.js";
import { buildProfile } from "./auth.routes.js";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const RECOVERY_CODE_COUNT = 8;

const codeSchema = z.object({ code: z.string().trim().min(4).max(24) });
const disableSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().min(4).max(24),
});
const verifySchema = z.object({
  challengeToken: z.string().min(20),
  code: z.string().trim().min(4).max(24),
});

function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function newRecoveryCodes(): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    plain.push(`${randomCode(4)}-${randomCode(4)}`);
  }
  return { plain, hashed: plain.map((code) => sha256(normalizeRecoveryCode(code))) };
}

function parseRecoveryCodes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function isLocked(lockedUntil: Date | null | undefined): boolean {
  return !!lockedUntil && lockedUntil.getTime() > Date.now();
}

/**
 * Accept a TOTP code or a one-time recovery code. Recovery codes are removed
 * from the stored list as soon as they are used.
 */
async function verifySecondFactor(
  user: { id: string; mfaSecret: string | null; mfaRecoveryCodes: string | null },
  code: string,
): Promise<boolean> {
  if (user.mfaSecret && verifyTotp(user.mfaSecret, code)) return true;

  const hashes = parseRecoveryCodes(user.mfaRecoveryCodes);
  if (hashes.length === 0) return false;
  const hash = sha256(normalizeRecoveryCode(code));
  const index = hashes.indexOf(hash);
  if (index === -1) return false;

  hashes.splice(index, 1);
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaRecoveryCodes: hashes.length ? JSON.stringify(hashes) : null },
  });
  return true;
}

export async function mfaRoutes(app: FastifyInstance) {
  app.get(
    "/api/auth/mfa/status",
    { preHandler: [app.authenticate], schema: { tags: ["Auth"], summary: "Two-factor authentication status" } },
    async (req, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: req.auth!.user.id },
        select: { mfaEnabled: true, mfaSecret: true, mfaRecoveryCodes: true },
      });
      if (!user) throw unauthorized();
      return reply.send({
        enabled: user.mfaEnabled,
        pendingSetup: !user.mfaEnabled && !!user.mfaSecret,
        recoveryCodesRemaining: parseRecoveryCodes(user.mfaRecoveryCodes).length,
      });
    },
  );

  app.post(
    "/api/auth/mfa/setup",
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { tags: ["Auth"], summary: "Start TOTP enrolment and return a QR code" },
    },
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.auth!.user.id } });
      if (!user) throw unauthorized();
      if (user.mfaEnabled) throw conflict("Two-factor authentication is already enabled", "MFA_ALREADY_ENABLED");

      const secret = generateTotpSecret();
      await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });

      const url = otpauthUrl(secret, user.email);
      const qrDataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 260,
        color: { dark: "#0b1220", light: "#ffffff" },
      });

      await auditFromRequest(req)({ action: "MFA_SETUP_STARTED", entity: "User", entityId: user.id });
      return reply.send({ secret, otpauthUrl: url, qrDataUrl });
    },
  );

  app.post(
    "/api/auth/mfa/enable",
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { tags: ["Auth"], summary: "Confirm a TOTP code and turn on MFA (returns recovery codes once)" },
    },
    async (req, reply) => {
      const { code } = codeSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { id: req.auth!.user.id } });
      if (!user) throw unauthorized();
      if (user.mfaEnabled) throw conflict("Two-factor authentication is already enabled", "MFA_ALREADY_ENABLED");
      if (!user.mfaSecret) throw badRequest("Start two-factor setup first", "MFA_SETUP_REQUIRED");

      if (!verifyTotp(user.mfaSecret, code)) {
        await auditFromRequest(req)({
          action: "MFA_ENABLE_FAILED",
          entity: "User",
          entityId: user.id,
          result: "FAILURE",
        });
        throw badRequest("Invalid verification code", "INVALID_MFA_CODE");
      }

      const recovery = newRecoveryCodes();
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaEnabled: true, mfaRecoveryCodes: JSON.stringify(recovery.hashed) },
      });
      await auditFromRequest(req)({ action: "MFA_ENABLED", entity: "User", entityId: user.id });
      return reply.send({ ok: true, recoveryCodes: recovery.plain });
    },
  );

  app.post(
    "/api/auth/mfa/disable",
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { tags: ["Auth"], summary: "Turn off MFA (requires the password and a current code)" },
    },
    async (req, reply) => {
      const { password, code } = disableSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { id: req.auth!.user.id } });
      if (!user) throw unauthorized();
      if (!user.mfaEnabled) throw badRequest("Two-factor authentication is not enabled", "MFA_NOT_ENABLED");
      if (!(await verifyPassword(password, user.passwordHash))) {
        throw unauthorized("Password is incorrect", "INVALID_CREDENTIALS");
      }
      if (!(await verifySecondFactor(user, code))) {
        await auditFromRequest(req)({
          action: "MFA_DISABLE_FAILED",
          entity: "User",
          entityId: user.id,
          result: "FAILURE",
        });
        throw unauthorized("Invalid verification code", "INVALID_MFA_CODE");
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: null },
      });
      // Other sessions must re-authenticate from scratch once MFA is removed.
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await auditFromRequest(req)({ action: "MFA_DISABLED", entity: "User", entityId: user.id });
      return reply.send({ ok: true });
    },
  );

  app.post(
    "/api/auth/mfa/recovery-codes",
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { tags: ["Auth"], summary: "Generate a fresh set of one-time recovery codes" },
    },
    async (req, reply) => {
      const { code } = codeSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { id: req.auth!.user.id } });
      if (!user) throw unauthorized();
      if (!user.mfaEnabled || !user.mfaSecret) {
        throw badRequest("Two-factor authentication is not enabled", "MFA_NOT_ENABLED");
      }
      if (!verifyTotp(user.mfaSecret, code)) {
        await auditFromRequest(req)({
          action: "MFA_RECOVERY_CODES_FAILED",
          entity: "User",
          entityId: user.id,
          result: "FAILURE",
        });
        throw unauthorized("Invalid verification code", "INVALID_MFA_CODE");
      }

      const recovery = newRecoveryCodes();
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaRecoveryCodes: JSON.stringify(recovery.hashed) },
      });
      await auditFromRequest(req)({
        action: "MFA_RECOVERY_CODES_REGENERATED",
        entity: "User",
        entityId: user.id,
      });
      return reply.send({ ok: true, recoveryCodes: recovery.plain });
    },
  );

  app.post(
    "/api/auth/mfa/verify",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { tags: ["Auth"], summary: "Complete login with a TOTP or recovery code" },
    },
    async (req, reply) => {
      const { challengeToken, code } = verifySchema.parse(req.body);

      let payload: { sub?: string; purpose?: string };
      try {
        payload = app.jwt.verify(challengeToken) as { sub?: string; purpose?: string };
      } catch {
        throw unauthorized("Verification session expired — sign in again", "MFA_CHALLENGE_EXPIRED");
      }
      if (payload.purpose !== "mfa" || !payload.sub) {
        throw unauthorized("Invalid verification session", "MFA_CHALLENGE_INVALID");
      }

      const user = await prisma.user.findFirst({
        where: { id: payload.sub, status: "ACTIVE", deletedAt: null },
      });
      if (!user || !user.mfaEnabled || !user.mfaSecret) {
        throw unauthorized("Two-factor authentication is no longer required", "MFA_NOT_REQUIRED");
      }
      if (isLocked(user.lockedUntil)) {
        throw new AppError(429, "ACCOUNT_LOCKED", "Account locked after repeated verification failures. Try again later.");
      }

      if (!(await verifySecondFactor(user, code))) {
        const fails = user.failedLoginCount + 1;
        const lockedUntil =
          fails >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: fails, lockedUntil },
        });
        await writeAudit(
          user.id,
          user.role,
          { action: "MFA_FAILED", result: "FAILURE", metadata: { attempts: fails } },
          req,
        );
        throw unauthorized("Invalid verification code", "INVALID_MFA_CODE");
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      const tokens = await issueTokens(app, user.id, user.role);
      const profile = await buildProfile(user.id);
      await writeAudit(
        user.id,
        user.role,
        { action: "LOGIN_MFA", entity: "User", entityId: user.id },
        req,
      );
      return reply.send({ ...tokens, user: profile });
    },
  );
}
