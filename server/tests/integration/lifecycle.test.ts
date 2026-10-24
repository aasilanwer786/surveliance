import { beforeAll, describe, expect, it } from "vitest";
import {
  EMAILS,
  createInvitation,
  getApp,
  getMainGateId,
  login,
  req,
} from "../helpers.js";

let guardToken = "";
let aliToken = "";
let hamzaToken = "";
let mainGateId = "";

beforeAll(async () => {
  await getApp();
  guardToken = (await login(EMAILS.guard1)).accessToken;
  aliToken = (await login(EMAILS.ali)).accessToken;
  hamzaToken = (await login(EMAILS.hamza)).accessToken;
  mainGateId = await getMainGateId(guardToken);
});

describe("full visitor lifecycle (invitation -> verify -> approve -> entry -> exit)", () => {
  let invitationId = "";
  let code = "";

  it("resident creates an invitation with a code and QR", async () => {
    const body = await createInvitation(aliToken, {
      visitorName: "Lifecycle Guest",
      visitorPhone: "+923001234567",
      purpose: "Family visit",
      vehicleNumber: "ABC-123",
    });
    invitationId = body.invitation.id;
    code = body.invitation.code;
    expect(code).toMatch(/^VIS-\d{4}-[A-Z2-9]{6}$/);
    expect(body.invitation.visitStatus).toBe("EXPECTED");
    expect(body.invitation.flatNumber).toBe("A-102");
    expect(body.qrDataUrl).toMatch(/^data:image/);
  });

  it("guard verification succeeds but entry is blocked until approval", async () => {
    const res = await req("POST", "/api/visitors/verify-code", {
      token: guardToken,
      payload: { code, gateId: mainGateId },
    });
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.entryAllowed).toBe(false);
    expect(res.body.pendingApprovals).toContain("RESIDENT");
    expect(res.body.invitation.visitorName).toBe("Lifecycle Guest");
  });

  it("a different resident cannot approve someone else's visitor", async () => {
    const res = await req("POST", `/api/visitors/${invitationId}/approve`, {
      token: hamzaToken,
      payload: { type: "RESIDENT" },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FOREIGN_INVITATION");
  });

  it("host resident approves and entry becomes allowed", async () => {
    const approve = await req("POST", `/api/visitors/${invitationId}/approve`, {
      token: aliToken,
      payload: { type: "RESIDENT" },
    });
    expect(approve.status).toBe(200);
    expect(approve.body.visitStatus).toBe("APPROVED");

    const reverify = await req("POST", "/api/visitors/verify-code", {
      token: guardToken,
      payload: { code, gateId: mainGateId },
    });
    expect(reverify.body.entryAllowed).toBe(true);
    expect(reverify.body.pendingApprovals).toEqual([]);
  });

  it("records entry and marks the visitor inside", async () => {
    const entry = await req("POST", `/api/visitors/${invitationId}/entry`, {
      token: guardToken,
      payload: { gateId: mainGateId, source: "QR" },
    });
    expect(entry.status).toBe(200);
    expect(entry.body.message).toBe("ENTRY APPROVED");
    expect(entry.body.invitation.visitStatus).toBe("INSIDE");

    const inside = await req("GET", "/api/visitors/currently-inside", { token: guardToken });
    expect(inside.status).toBe(200);
    const names = inside.body.items.map((i: { visitorName: string }) => i.visitorName);
    expect(names).toContain("Lifecycle Guest");

    const detail = await req("GET", `/api/visitors/${invitationId}`, { token: aliToken });
    expect(detail.status).toBe(200);
    expect(detail.body.entries).toHaveLength(1);
    expect(detail.body.entries[0].gate.name).toBeTruthy();
    expect(detail.body.entries[0].guard.name).toBeTruthy();
  });

  it("rejects double entry", async () => {
    const again = await req("POST", `/api/visitors/${invitationId}/entry`, {
      token: guardToken,
      payload: { gateId: mainGateId },
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_INSIDE");

    const reverify = await req("POST", "/api/visitors/verify-code", {
      token: guardToken,
      payload: { code, gateId: mainGateId },
    });
    expect(reverify.status).toBe(200);
    expect(reverify.body.verified).toBe(false);
    expect(reverify.body.reason).toBe("ALREADY_INSIDE");
    expect(reverify.body.alertId).toBeTruthy();
  });

  it("records exit and the visitor leaves the inside list", async () => {
    const exit = await req("POST", `/api/visitors/${invitationId}/exit`, {
      token: guardToken,
      payload: { gateId: mainGateId },
    });
    expect(exit.status).toBe(200);
    expect(exit.body.invitation.visitStatus).toBe("EXITED");
    expect(exit.body.exit.exitedAt).toBeTruthy();

    const inside = await req("GET", "/api/visitors/currently-inside", { token: guardToken });
    const names = inside.body.items.map((i: { visitorName: string }) => i.visitorName);
    expect(names).not.toContain("Lifecycle Guest");

    const detail = await req("GET", `/api/visitors/${invitationId}`, { token: aliToken });
    expect(detail.body.exits).toHaveLength(1);

    const reverify = await req("POST", "/api/visitors/verify-code", {
      token: guardToken,
      payload: { code, gateId: mainGateId },
    });
    expect(reverify.body.verified).toBe(false);
  });
});

describe("QR verification with AUTO policy", () => {
  it("grants immediate entry for auto-approved invitations", async () => {
    const body = await createInvitation(aliToken, {
      visitorName: "Auto Guest",
      approvalPolicy: "AUTO",
    });
    const code = body.invitation.code;

    const qr = await req("POST", "/api/visitors/verify-qr", {
      token: guardToken,
      payload: { code: `SVC:${code}`, gateId: mainGateId },
    });
    expect(qr.status).toBe(200);
    expect(qr.body.verified).toBe(true);
    expect(qr.body.entryAllowed).toBe(true);

    const entry = await req("POST", `/api/visitors/${body.invitation.id}/entry`, {
      token: guardToken,
      payload: { gateId: mainGateId, source: "QR" },
    });
    expect(entry.status).toBe(200);

    const exit = await req("POST", `/api/visitors/${body.invitation.id}/exit`, {
      token: guardToken,
      payload: { gateId: mainGateId },
    });
    expect(exit.status).toBe(200);
  });
});

describe("rejection flow", () => {
  it("blocks verification after the resident rejects the visitor", async () => {
    const hamza = (await login(EMAILS.hamza)).accessToken;
    const body = await createInvitation(hamza, {
      visitorName: "Rejected Guest",
      approvalPolicy: "RESIDENT",
    });

    const reject = await req("POST", `/api/visitors/${body.invitation.id}/reject`, {
      token: hamza,
      payload: { type: "RESIDENT", reason: "Not expecting this visitor" },
    });
    expect(reject.status).toBe(200);
    expect(reject.body.visitStatus).toBe("DENIED");

    const verify = await req("POST", "/api/visitors/verify-code", {
      token: guardToken,
      payload: { code: body.invitation.code, gateId: mainGateId },
    });
    expect(verify.status).toBe(200);
    expect(verify.body.verified).toBe(false);
    expect(verify.body.reason).toBe("REJECTED");
    expect(verify.body.alertId).toBeTruthy();
  });
});

describe("unknown codes fail closed", () => {
  it("returns verified=false with an alert for a bogus code", async () => {
    const res = await req("POST", "/api/visitors/verify-code", {
      token: guardToken,
      payload: { code: "VIS-2026-NOPE99", gateId: mainGateId },
    });
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(false);
    expect(res.body.entryAllowed).toBeFalsy();
    expect(res.body.reason).toBe("NOT_FOUND");
    expect(res.body.alertId).toBeTruthy();
  });

  it("guards cannot approve their own verification decisions", async () => {
    const guard = await login(EMAILS.guard1);
    const body = await createInvitation(aliToken, { visitorName: "Guard Approver Test" });
    const res = await req("POST", `/api/visitors/${body.invitation.id}/approve`, {
      token: guard.accessToken,
      payload: { type: "RESIDENT" },
    });
    expect(res.status).toBe(403);
  });
});
