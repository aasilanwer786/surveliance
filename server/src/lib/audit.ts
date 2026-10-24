import type { FastifyRequest } from "fastify";
import { prisma } from "../db.js";

export interface AuditEntry {
  action: string;
  entity?: string;
  entityId?: string;
  result?: "SUCCESS" | "FAILURE";
  metadata?: Record<string, unknown>;
}

export async function writeAudit(userId: string | null | undefined, userRole: string | null | undefined, entry: AuditEntry, req?: FastifyRequest): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        userRole: userRole ?? null,
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        result: entry.result ?? "SUCCESS",
        ip: req?.ip ?? null,
        device: req?.headers["user-agent"] ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", err);
  }
}

export function auditFromRequest(req: FastifyRequest) {
  return (entry: AuditEntry) =>
    writeAudit(req.auth?.user.id, req.auth?.user.role, entry, req);
}
