import { prisma } from "../db.js";
import { hub } from "../lib/wsHub.js";
import { getBoolSetting } from "../lib/settings.js";

export const VOICE_EVENTS = [
  "VERIFY_OK",
  "VERIFY_FAILED",
  "UNAUTHORIZED",
  "UNKNOWN_PERSON",
  "OVERSTAY",
  "LOCKDOWN",
  "EMERGENCY",
] as const;

export type VoiceEvent = (typeof VOICE_EVENTS)[number];

export const VOICE_EVENT_DEFAULTS: Record<string, { message: string; priority: string }> = {
  VERIFY_OK: { message: "Visitor verified.", priority: "LOW" },
  VERIFY_FAILED: { message: "Warning. Visitor code could not be verified.", priority: "HIGH" },
  UNAUTHORIZED: {
    message: "Security alert. An unverified visitor is attempting to enter the premises.",
    priority: "CRITICAL",
  },
  UNKNOWN_PERSON: {
    message:
      "Security alert. An unidentified visitor has been detected inside the apartment premises. Security personnel are requested to verify immediately.",
    priority: "EMERGENCY",
  },
  OVERSTAY: { message: "Alert. A visitor has exceeded the expected visit duration.", priority: "MEDIUM" },
  LOCKDOWN: { message: "Emergency alert. Please follow security procedures immediately.", priority: "EMERGENCY" },
  EMERGENCY: { message: "Emergency alert. Please follow security procedures immediately.", priority: "EMERGENCY" },
};

export interface VoiceAlertPayload {
  event: string;
  message: string;
  priority: string;
  voice: string;
  volume: number;
  repeatCount: number;
  repeatIntervalSeconds: number;
  targetRoles: string[];
}

export async function emitVoiceAlert(event: string): Promise<VoiceAlertPayload | null> {
  try {
    if (!(await getBoolSetting("voiceAlertsEnabled"))) return null;
    const cfg = await prisma.voiceAlertConfig.findUnique({ where: { event } });
    if (!cfg || !cfg.enabled) return null;
    const payload: VoiceAlertPayload = {
      event,
      message: cfg.message,
      priority: cfg.priority,
      voice: cfg.voice,
      volume: cfg.volume,
      repeatCount: cfg.repeatCount,
      repeatIntervalSeconds: cfg.repeatIntervalSeconds,
      targetRoles: cfg.targetRoles
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
    };
    const topics = [...payload.targetRoles.map((r) => `role:${r}`), "staff"];
    hub.publishMany(topics, { type: "voice-alert", data: payload });
    return payload;
  } catch (err) {
    console.error("[voice] failed to emit voice alert", err);
    return null;
  }
}
