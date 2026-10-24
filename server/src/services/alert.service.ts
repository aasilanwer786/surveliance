import { prisma } from "../db.js";
import { hub } from "../lib/wsHub.js";
import { generateAlertCode, generateIncidentCode } from "../lib/codes.js";
import { emitVoiceAlert } from "./voice.service.js";
import { notifyRoles } from "./notification.service.js";
import { ROLES } from "../lib/rbac.js";
import type { Prisma, SecurityAlert, SecurityIncident } from "@prisma/client";

export type AlertPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "EMERGENCY";

export interface CreateAlertInput {
  type: string;
  priority?: AlertPriority;
  title: string;
  description: string;
  gateId?: string | null;
  location?: string | null;
  subjectName?: string | null;
  subjectPhone?: string | null;
  photoPath?: string | null;
  invitationId?: string | null;
  detectorEventId?: string | null;
  autoIncident?: boolean;
  voiceEvent?: string | null;
  notifyAdmins?: boolean;
}

const ALERT_VOICE_MAP: Record<string, string> = {
  INVALID_CODE: "VERIFY_FAILED",
  EXPIRED_CODE: "VERIFY_FAILED",
  UNAUTHORIZED_VISITOR: "UNAUTHORIZED",
  WATCHLIST_MATCH: "UNAUTHORIZED",
  UNKNOWN_PERSON: "UNKNOWN_PERSON",
  LOCKDOWN: "LOCKDOWN",
  OVERSTAY: "OVERSTAY",
};

const STAFF_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SECURITY, ROLES.GUARD];

export async function createAlert(input: CreateAlertInput): Promise<SecurityAlert> {
  const priority: AlertPriority = input.priority ?? "HIGH";
  const alert = await prisma.securityAlert.create({
    data: {
      code: generateAlertCode(),
      type: input.type,
      priority,
      status: "NEW",
      title: input.title,
      description: input.description,
      gateId: input.gateId ?? null,
      location: input.location ?? null,
      subjectName: input.subjectName ?? null,
      subjectPhone: input.subjectPhone ?? null,
      photoPath: input.photoPath ?? null,
      invitationId: input.invitationId ?? null,
      detectorEventId: input.detectorEventId ?? null,
    },
  });

  hub.publish("staff", { type: "security-alert", data: serializeAlert(alert) });
  hub.publish("broadcast", { type: "security-alert-count", data: { bump: 1 } });

  const voiceEvent = input.voiceEvent ?? ALERT_VOICE_MAP[input.type];
  if (voiceEvent) await emitVoiceAlert(voiceEvent);

  if (input.notifyAdmins !== false) {
    await notifyRoles(STAFF_ROLES, {
      type: "SECURITY_ALERT",
      title: `${priority} ALERT: ${alert.title}`,
      body: alert.description,
      priority: priority === "EMERGENCY" ? "EMERGENCY" : priority === "CRITICAL" ? "CRITICAL" : "HIGH",
      data: { alertId: alert.id, alertCode: alert.code, type: alert.type },
      channels: ["IN_APP", "PUSH"],
    });
  }

  const needsIncident =
    input.autoIncident ||
    alert.type === "UNKNOWN_PERSON" ||
    priority === "CRITICAL" ||
    priority === "EMERGENCY";

  if (needsIncident) {
    await createIncidentFromAlert(alert);
    const updated = await prisma.securityAlert.findUnique({ where: { id: alert.id } });
    return updated ?? alert;
  }

  return alert;
}

export async function createIncidentFromAlert(alert: SecurityAlert): Promise<SecurityIncident> {
  const incident = await prisma.securityIncident.create({
    data: {
      code: generateIncidentCode(),
      type: alert.type,
      priority: alert.priority,
      status: "NEW",
      title: alert.title,
      description: alert.description,
      location: alert.location ?? null,
      gateId: alert.gateId ?? null,
      subjectName: alert.subjectName ?? null,
      subjectPhone: alert.subjectPhone ?? null,
      photoPath: alert.photoPath ?? null,
      reportedById: (await ensureSystemReporter()) as string,
    },
  });
  await prisma.securityAlert.update({
    where: { id: alert.id },
    data: { incidentId: incident.id },
  });
  hub.publish("staff", { type: "incident", data: { action: "created", incident: serializeIncident(incident) } });
  return incident;
}

async function ensureSystemReporter(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { role: ROLES.SUPER_ADMIN, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (admin) return admin.id;
  const anyUser = await prisma.user.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
  if (anyUser) return anyUser.id;
  const created = await prisma.user.create({
    data: {
      email: "system@local",
      name: "System",
      role: ROLES.SUPER_ADMIN,
      passwordHash: "!",
      status: "ACTIVE",
    },
  });
  return created.id;
}

export interface CreateIncidentInput {
  type: string;
  priority?: string;
  title: string;
  description: string;
  location?: string | null;
  gateId?: string | null;
  subjectName?: string | null;
  subjectPhone?: string | null;
  photoPath?: string | null;
  reportedById: string;
  assignedGuardId?: string | null;
  alertId?: string | null;
}

export async function createIncident(input: CreateIncidentInput): Promise<SecurityIncident> {
  const incident = await prisma.securityIncident.create({
    data: {
      code: generateIncidentCode(),
      type: input.type,
      priority: input.priority ?? "HIGH",
      status: "NEW",
      title: input.title,
      description: input.description,
      location: input.location ?? null,
      gateId: input.gateId ?? null,
      subjectName: input.subjectName ?? null,
      subjectPhone: input.subjectPhone ?? null,
      photoPath: input.photoPath ?? null,
      reportedById: input.reportedById,
      assignedGuardId: input.assignedGuardId ?? null,
    },
  });
  if (input.alertId) {
    await prisma.securityAlert.update({ where: { id: input.alertId }, data: { incidentId: incident.id } });
  }
  hub.publish("staff", { type: "incident", data: { action: "created", incident: serializeIncident(incident) } });
  return incident;
}

export function serializeAlert(alert: SecurityAlert): Record<string, unknown> {
  return {
    id: alert.id,
    code: alert.code,
    type: alert.type,
    priority: alert.priority,
    status: alert.status,
    title: alert.title,
    description: alert.description,
    gateId: alert.gateId,
    location: alert.location,
    subjectName: alert.subjectName,
    subjectPhone: alert.subjectPhone,
    photoPath: alert.photoPath,
    invitationId: alert.invitationId,
    detectorEventId: alert.detectorEventId,
    incidentId: alert.incidentId,
    acknowledgedAt: alert.acknowledgedAt,
    resolvedAt: alert.resolvedAt,
    resolution: alert.resolution,
    createdAt: alert.createdAt,
  };
}

export function serializeIncident(incident: SecurityIncident): Record<string, unknown> {
  return { ...incident };
}
