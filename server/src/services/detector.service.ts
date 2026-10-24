import { prisma } from "../db.js";
import { createAlert } from "./alert.service.js";
import { emitVoiceAlert } from "./voice.service.js";
import type { Prisma } from "@prisma/client";

export interface DetectorEventInput {
  source?: string;
  type: string;
  area?: string | null;
  gateId?: string | null;
  cameraId?: string | null;
  confidence?: number | null;
  payload?: Record<string, unknown> | null;
}

const ALERTING_TYPES: Record<string, { priority: "MEDIUM" | "HIGH" | "CRITICAL"; title: string; description: string }> = {
  UNKNOWN_PERSON: {
    priority: "CRITICAL",
    title: "Unidentified person detected inside premises",
    description:
      "Security alert. An unidentified visitor has been detected inside the apartment premises without a corresponding valid entry record.",
  },
  INTRUSION: {
    priority: "CRITICAL",
    title: "Intrusion detected",
    description: "An intrusion event was reported by the surveillance integration layer.",
  },
  RESTRICTED_AREA: {
    priority: "HIGH",
    title: "Restricted area breach",
    description: "A person was detected inside a restricted area.",
  },
  LOITERING: {
    priority: "MEDIUM",
    title: "Loitering detected",
    description: "Loitering behaviour detected by video analytics.",
  },
  CROWD: {
    priority: "MEDIUM",
    title: "Crowd detected",
    description: "Unusual crowd density detected by video analytics.",
  },
};

export async function ingestDetectorEvent(input: DetectorEventInput) {
  const payload = input.payload ?? null;
  let status: "PROCESSED" | "DISMISSED" | "NEW" = "PROCESSED";
  let alertId: string | null = null;

  const event = await prisma.detectorEvent.create({
    data: {
      source: input.source ?? "CCTV",
      type: input.type,
      area: input.area ?? null,
      gateId: input.gateId ?? null,
      cameraId: input.cameraId ?? null,
      confidence: input.confidence ?? null,
      payload: payload ? JSON.stringify(payload) : null,
      status: "NEW",
    },
  });

  const camera = input.cameraId
    ? await prisma.camera.findFirst({
        where: { id: input.cameraId, deletedAt: null },
        select: { id: true, name: true, area: true },
      })
    : null;
  const resolvedArea = input.area ?? camera?.area ?? undefined;
  const cameraNote = camera ? ` Camera: ${camera.name}.` : "";

  if (input.type === "UNKNOWN_PERSON") {
    const code =
      typeof payload?.visitorCode === "string"
        ? payload.visitorCode
        : typeof payload?.invitationCode === "string"
          ? payload.invitationCode
          : null;
    let matchedInside = false;
    if (code) {
      const inv = await prisma.visitorInvitation.findUnique({ where: { code: code.toUpperCase() } });
      matchedInside = !!inv && inv.visitStatus === "INSIDE";
    }
    if (!matchedInside) {
      const cfg = ALERTING_TYPES.UNKNOWN_PERSON;
      const alert = await createAlert({
        type: "UNKNOWN_PERSON",
        priority: cfg.priority,
        title: cfg.title,
        description: `${cfg.description}${code ? ` Provided reference: ${code}.` : ""}${cameraNote}`,
        gateId: input.gateId ?? null,
        location: resolvedArea ?? null,
        detectorEventId: event.id,
        autoIncident: true,
      });
      alertId = alert.id;
    }
  } else if (input.type === "PERSON_DETECTED") {
    status = "PROCESSED";
  } else {
    const cfg = ALERTING_TYPES[input.type];
    if (cfg) {
      const alert = await createAlert({
        type: input.type === "INTRUSION" || input.type === "RESTRICTED_AREA" ? "UNAUTHORIZED_VISITOR" : "CUSTOM",
        priority: cfg.priority,
        title: cfg.title,
        description: `${cfg.description}${resolvedArea ? ` Area: ${resolvedArea}.` : ""}${cameraNote}`,
        gateId: input.gateId ?? null,
        location: resolvedArea ?? null,
        detectorEventId: event.id,
        autoIncident: cfg.priority === "CRITICAL",
      });
      alertId = alert.id;
      if (input.type === "LOITERING" || input.type === "CROWD") {
        await emitVoiceAlert("UNAUTHORIZED");
      }
    }
  }

  const updated = await prisma.detectorEvent.update({
    where: { id: event.id },
    data: { status, alertId },
  });
  return updated;
}

export async function detectorEventWhere(extra: Prisma.DetectorEventWhereInput = {}) {
  return prisma.detectorEvent.findMany({
    where: extra,
    include: {
      gate: { select: { id: true, name: true } },
      camera: { select: { id: true, name: true } },
      alert: { select: { id: true, code: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
