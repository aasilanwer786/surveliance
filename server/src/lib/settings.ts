import { prisma } from "../db.js";

export const SETTING_DEFAULTS: Record<string, string> = {
  approvalPolicy: "RESIDENT", // AUTO | RESIDENT | SECURITY | BOTH
  lockdownActive: "false",
  overstayEnabled: "true",
  overstayGraceMinutes: "15",
  visitorDataRetentionDays: "90",
  retentionAnonymizationEnabled: "false",
  voiceAlertsEnabled: "true",
  allowInvitationExtension: "true",
  maxInvitationDaysAhead: "30",
  invitationDefaultDurationMinutes: "120",
  invitationArrivalWindowMinutes: "60",
  requireVehicleNumber: "false",
  notifyChannels: "IN_APP,PUSH",
  alertChannels: "IN_APP,PUSH",
  securityStatusNormalThreshold: "0",
  systemName: "SecureResident",
  integrationApiKey: "",
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (row) return row.value;
  return SETTING_DEFAULTS[key] ?? "";
}

export async function getBoolSetting(key: string): Promise<boolean> {
  return (await getSetting(key)).toLowerCase() === "true";
}

export async function getIntSetting(key: string): Promise<number> {
  const v = Number(await getSetting(key));
  return Number.isFinite(v) ? v : Number(SETTING_DEFAULTS[key] ?? 0);
}

export async function getManySettings(keys?: string[]): Promise<Record<string, string>> {
  const keysToFetch = keys ?? Object.keys(SETTING_DEFAULTS);
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: keysToFetch } },
  });
  const out: Record<string, string> = {};
  for (const k of keysToFetch) {
    const row = rows.find((r) => r.key === k);
    out[k] = row ? row.value : (SETTING_DEFAULTS[k] ?? "");
  }
  return out;
}

export async function setSetting(key: string, value: string, updatedBy?: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  });
}

export async function isLockdownActive(): Promise<boolean> {
  return getBoolSetting("lockdownActive");
}

export async function getApprovalPolicy(): Promise<string> {
  const policy = await getSetting("approvalPolicy");
  return ["AUTO", "RESIDENT", "SECURITY", "BOTH"].includes(policy) ? policy : "RESIDENT";
}
