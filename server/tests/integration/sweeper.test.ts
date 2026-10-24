import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { setSetting } from "../../src/lib/settings.js";
import { runOverstaySweep, runRetentionSweep } from "../../src/jobs/sweeps.js";
import { EMAILS, createInvitation, getApp, getMainGateId, login, req } from "../helpers.js";

let guardToken = "";
let aliToken = "";
let mainGateId = "";

beforeAll(async () => {
  await getApp();
  guardToken = (await login(EMAILS.guard1)).accessToken;
  aliToken = (await login(EMAILS.ali)).accessToken;
  mainGateId = await getMainGateId(guardToken);
});

async function enterGuest(name: string, overrides: Record<string, unknown> = {}) {
  const body = await createInvitation(aliToken, { visitorName: name, approvalPolicy: "AUTO", ...overrides });
  const verify = await req("POST", "/api/visitors/verify-code", {
    token: guardToken,
    payload: { code: body.invitation.code, gateId: mainGateId },
  });
  expect(verify.body.entryAllowed).toBe(true);
  const entry = await req("POST", `/api/visitors/${body.invitation.id}/entry`, {
    token: guardToken,
    payload: { gateId: mainGateId },
  });
  expect(entry.status).toBe(200);
  return body.invitation.id as string;
}

describe("overstay sweep", () => {
  it("alerts on visitors past their expected exit exactly once", async () => {
    await runOverstaySweep();

    const invitationId = await enterGuest("Overstay Guest");
    await prisma.visitorInvitation.update({
      where: { id: invitationId },
      data: { expectedExitAt: new Date(Date.now() - 2 * 60 * 60_000) },
    });

    const first = await runOverstaySweep();
    expect(first).toBeGreaterThanOrEqual(1);

    const inv = await prisma.visitorInvitation.findUniqueOrThrow({ where: { id: invitationId } });
    expect(inv.overstayAlertedAt).not.toBeNull();

    const alerts = await prisma.securityAlert.findMany({ where: { invitationId, type: "OVERSTAY" } });
    expect(alerts.length).toBe(1);
    expect(alerts[0].priority).toBe("HIGH");

    const notifications = await prisma.notification.findMany({
      where: { userId: (await prisma.visitorInvitation.findUniqueOrThrow({ where: { id: invitationId }, include: { resident: { include: { user: true } } } })).resident.userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    expect(notifications.some((n) => n.type === "VISITOR_OVERSTAY")).toBe(true);

    const second = await runOverstaySweep();
    expect(second).toBe(0);

    await prisma.securityAlert.deleteMany({ where: { invitationId } });
    await req("POST", `/api/visitors/${invitationId}/exit`, {
      token: guardToken,
      payload: { gateId: mainGateId },
    });
  });

  it("does nothing when the overstay job is disabled", async () => {
    await setSetting("overstayEnabled", "false");
    const invitationId = await enterGuest("Disabled Sweep Guest");
    await prisma.visitorInvitation.update({
      where: { id: invitationId },
      data: { expectedExitAt: new Date(Date.now() - 2 * 60 * 60_000) },
    });

    const count = await runOverstaySweep();
    expect(count).toBe(0);
    const inv = await prisma.visitorInvitation.findUniqueOrThrow({ where: { id: invitationId } });
    expect(inv.overstayAlertedAt).toBeNull();

    await setSetting("overstayEnabled", "true");
    await prisma.visitorInvitation.update({ where: { id: invitationId }, data: { overstayAlertedAt: new Date() } });
    await prisma.securityAlert.deleteMany({ where: { invitationId } });
    await req("POST", `/api/visitors/${invitationId}/exit`, {
      token: guardToken,
      payload: { gateId: mainGateId },
    });
  });
});

describe("retention sweep", () => {
  it("anonymizes visitors older than the retention window", async () => {
    const invitationId = await enterGuest("Retention Guest");
    await req("POST", `/api/visitors/${invitationId}/exit`, {
      token: guardToken,
      payload: { gateId: mainGateId },
    });

    await prisma.visitorInvitation.update({
      where: { id: invitationId },
      data: { expectedAt: new Date(Date.now() - 400 * 24 * 3600_000) },
    });

    const disabled = await runRetentionSweep();
    expect(disabled).toBe(0);
    let inv = await prisma.visitorInvitation.findUniqueOrThrow({ where: { id: invitationId } });
    expect(inv.visitorName).toBe("Retention Guest");

    await setSetting("retentionAnonymizationEnabled", "true");
    const redacted = await runRetentionSweep();
    expect(redacted).toBeGreaterThanOrEqual(1);

    inv = await prisma.visitorInvitation.findUniqueOrThrow({ where: { id: invitationId } });
    expect(inv.visitorName).toBe("Redacted");
    expect(inv.visitorPhone).toBeNull();
    expect(inv.vehicleNumber).toBeNull();

    await setSetting("retentionAnonymizationEnabled", "false");
    await prisma.securityAlert.deleteMany({ where: { invitationId } });
  });
});
