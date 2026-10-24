import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMAILS, createInvitation, getApp, getMainGateId, login, req } from "../helpers.js";

let superToken = "";
let guardToken = "";
let aliToken = "";
let hamzaToken = "";
let mainGateId = "";

beforeAll(async () => {
  await getApp();
  superToken = (await login(EMAILS.super)).accessToken;
  guardToken = (await login(EMAILS.guard1)).accessToken;
  aliToken = (await login(EMAILS.ali)).accessToken;
  hamzaToken = (await login(EMAILS.hamza)).accessToken;
  mainGateId = await getMainGateId(guardToken);
});

afterAll(async () => {
  const release = await req("POST", "/api/security/lockdown/release", {
    token: superToken,
    payload: { notes: "test teardown" },
  });
  expect([200, 409]).toContain(release.status);
});

describe("RBAC boundaries", () => {
  it("residents cannot verify visitor codes", async () => {
    const res = await req("POST", "/api/visitors/verify-code", {
      token: aliToken,
      payload: { code: "VIS-2026-GUEST1" },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("MISSING_PERMISSION");
  });

  it("guards cannot manage lockdown", async () => {
    const res = await req("POST", "/api/security/lockdown", {
      token: guardToken,
      payload: { reason: "nope" },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("MISSING_PERMISSION");
  });

  it("residents cannot read security alerts", async () => {
    const res = await req("GET", "/api/security/alerts", { token: aliToken });
    expect(res.status).toBe(403);
  });

  it("residents cannot read other residents' invitations", async () => {
    const body = await createInvitation(aliToken, { visitorName: "Private Guest" });
    const res = await req("GET", `/api/visitors/invitations/${body.invitation.id}`, {
      token: hamzaToken,
    });
    expect([403, 404]).toContain(res.status);
  });
});

describe("lockdown", () => {
  it("blocks verification and approvals while active", async () => {
    const activate = await req("POST", "/api/security/lockdown", {
      token: superToken,
      payload: { reason: "drill" },
    });
    expect(activate.status).toBe(200);
    expect(activate.body.active).toBe(true);

    const duplicate = await req("POST", "/api/security/lockdown", {
      token: superToken,
      payload: { reason: "again" },
    });
    expect(duplicate.status).toBe(409);

    const body = await createInvitation(aliToken, { visitorName: "Lockdown Guest" });
    const verify = await req("POST", "/api/visitors/verify-code", {
      token: guardToken,
      payload: { code: body.invitation.code, gateId: mainGateId },
    });
    expect(verify.status).toBe(200);
    expect(verify.body.verified).toBe(false);
    expect(verify.body.reason).toBe("LOCKDOWN_ACTIVE");

    const approve = await req("POST", `/api/visitors/${body.invitation.id}/approve`, {
      token: aliToken,
      payload: { type: "RESIDENT" },
    });
    expect(approve.status).toBe(403);
    expect(approve.body.error.code).toBe("LOCKDOWN_ACTIVE");

    const status = await req("GET", "/api/security/status", { token: guardToken });
    expect(status.body.lockdownActive).toBe(true);

    const release = await req("POST", "/api/security/lockdown/release", {
      token: superToken,
      payload: { notes: "drill complete" },
    });
    expect(release.status).toBe(200);

    const verifyAfter = await req("POST", "/api/visitors/verify-code", {
      token: guardToken,
      payload: { code: body.invitation.code, gateId: mainGateId },
    });
    expect(verifyAfter.body.verified).toBe(true);
  });
});

describe("watchlist", () => {
  it("upgrades AUTO policy to security approval and raises an alert", async () => {
    const watchName = "Watched Person";
    const added = await req("POST", "/api/security/watchlist", {
      token: superToken,
      payload: { name: watchName, reason: "Known troublemaker", level: "WATCHLIST" },
    });
    expect(added.status).toBe(201);

    const body = await createInvitation(aliToken, {
      visitorName: watchName,
      approvalPolicy: "AUTO",
    });

    const verify = await req("POST", "/api/visitors/verify-code", {
      token: guardToken,
      payload: { code: body.invitation.code, gateId: mainGateId },
    });
    expect(verify.status).toBe(200);
    expect(verify.body.verified).toBe(true);
    expect(verify.body.watchlisted).toBe(true);
    expect(verify.body.policy).toBe("SECURITY");
    expect(verify.body.pendingApprovals).toContain("SECURITY");
    expect(verify.body.entryAllowed).toBe(false);

    const alerts = await req("GET", "/api/security/alerts", { token: superToken });
    const match = alerts.body.items.find(
      (a: { type: string; invitationId: string | null }) =>
        a.type === "WATCHLIST_MATCH" && a.invitationId === body.invitation.id,
    );
    expect(match).toBeTruthy();

    const securityApprove = await req("POST", `/api/visitors/${body.invitation.id}/approve`, {
      token: (await login(EMAILS.security)).accessToken,
      payload: { type: "SECURITY" },
    });
    expect(securityApprove.status).toBe(200);

    const reverify = await req("POST", "/api/visitors/verify-code", {
      token: guardToken,
      payload: { code: body.invitation.code, gateId: mainGateId },
    });
    expect(reverify.body.policy).toBe("BOTH");
    expect(reverify.body.pendingApprovals).toContain("RESIDENT");
    expect(reverify.body.entryAllowed).toBe(false);

    const residentApprove = await req("POST", `/api/visitors/${body.invitation.id}/approve`, {
      token: aliToken,
      payload: { type: "RESIDENT" },
    });
    expect(residentApprove.status).toBe(200);

    const finalVerify = await req("POST", "/api/visitors/verify-code", {
      token: guardToken,
      payload: { code: body.invitation.code, gateId: mainGateId },
    });
    expect(finalVerify.body.entryAllowed).toBe(true);

    const entry = await req("POST", `/api/visitors/${body.invitation.id}/entry`, {
      token: guardToken,
      payload: { gateId: mainGateId },
    });
    expect(entry.status).toBe(200);
    const exit = await req("POST", `/api/visitors/${body.invitation.id}/exit`, {
      token: guardToken,
      payload: { gateId: mainGateId },
    });
    expect(exit.status).toBe(200);
  });

  it("BLOCKED entries deny verification outright", async () => {
    const blockedName = "Blocked Person";
    await req("POST", "/api/security/watchlist", {
      token: superToken,
      payload: { name: blockedName, reason: "Court order", level: "BLOCKED" },
    });

    const body = await createInvitation(aliToken, { visitorName: blockedName, approvalPolicy: "AUTO" });
    const verify = await req("POST", "/api/visitors/verify-code", {
      token: guardToken,
      payload: { code: body.invitation.code, gateId: mainGateId },
    });
    expect(verify.status).toBe(200);
    expect(verify.body.verified).toBe(false);
    expect(verify.body.reason).toBe("BLOCKED");
    expect(verify.body.alertId).toBeTruthy();
  });
});

describe("detector events (fail-secure integration)", () => {
  it("rejects unauthenticated ingestion", async () => {
    const res = await req("POST", "/api/integrations/detector-events", {
      payload: { type: "LOITERING", area: "Parking" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNAUTHORIZED_INTEGRATION");
  });

  it("accepts events from an authorized principal and creates alerts", async () => {
    const event = await req("POST", "/api/integrations/detector-events", {
      token: superToken,
      payload: { type: "LOITERING", area: "Parking Bay 3", confidence: 0.87 },
    });
    expect(event.status).toBe(201);
    expect(event.body.type).toBe("LOITERING");

    const events = await req("GET", "/api/security/detector-events", { token: superToken });
    expect(events.body.items.some((e: { type: string }) => e.type === "LOITERING")).toBe(true);

    const alerts = await req("GET", "/api/security/alerts", { token: superToken });
    const loitering = alerts.body.items.find(
      (a: { title: string; priority: string }) => a.title === "Loitering detected" && a.priority === "MEDIUM",
    );
    expect(loitering).toBeTruthy();
  });

  it("UNKNOWN_PERSON creates a critical alert", async () => {
    const event = await req("POST", "/api/integrations/detector-events", {
      token: superToken,
      payload: { type: "UNKNOWN_PERSON", area: "Gate lobby", confidence: 0.95 },
    });
    expect(event.status).toBe(201);

    const alerts = await req("GET", "/api/security/alerts", { token: superToken });
    const critical = alerts.body.items.find(
      (a: { type: string; priority: string }) => a.type === "UNKNOWN_PERSON" && a.priority === "CRITICAL",
    );
    expect(critical).toBeTruthy();
  });
});

describe("lockdown during verification is fail-secure on entry", () => {
  it("entry attempts fail while lockdown is active", async () => {
    const body = await createInvitation(aliToken, { visitorName: "Entry Lockdown Guest", approvalPolicy: "AUTO" });
    await req("POST", "/api/security/lockdown", { token: superToken, payload: { reason: "entry drill" } });

    const entry = await req("POST", `/api/visitors/${body.invitation.id}/entry`, {
      token: guardToken,
      payload: { gateId: mainGateId },
    });
    expect(entry.status).toBe(403);
    expect(entry.body.error.code).toBe("LOCKDOWN_ACTIVE");

    await req("POST", "/api/security/lockdown/release", { token: superToken, payload: { notes: "done" } });

    const entryAfter = await req("POST", `/api/visitors/${body.invitation.id}/entry`, {
      token: guardToken,
      payload: { gateId: mainGateId },
    });
    expect(entryAfter.status).toBe(200);
    await req("POST", `/api/visitors/${body.invitation.id}/exit`, {
      token: guardToken,
      payload: { gateId: mainGateId },
    });
  });
});

describe("cameras and camera-linked alerts", () => {
  it("guards cannot read cameras or snapshots", async () => {
    const list = await req("GET", "/api/cameras", { token: guardToken });
    expect(list.status).toBe(403);

    const snap = await req("GET", "/api/cameras/anything/snapshot", { token: guardToken });
    expect(snap.status).toBe(403);
  });

  it("returns 404 for a snapshot of an unknown camera", async () => {
    const res = await req("GET", "/api/cameras/does-not-exist/snapshot", { token: superToken });
    expect(res.status).toBe(404);
  });

  it("links detector alerts and incidents back to the detecting camera", async () => {
    const cameras = await req("GET", "/api/cameras", { token: superToken });
    expect(cameras.body.items.length).toBeGreaterThan(0);
    const camera = cameras.body.items[0] as { id: string; name: string };

    const event = await req("POST", "/api/integrations/detector-events", {
      token: superToken,
      payload: { type: "UNKNOWN_PERSON", cameraId: camera.id, confidence: 0.91 },
    });
    expect(event.status).toBe(201);

    const alerts = await req("GET", "/api/security/alerts?type=UNKNOWN_PERSON", { token: superToken });
    const linked = alerts.body.items.find(
      (a: { detectorEvent?: { camera?: { id: string } | null } | null }) =>
        a.detectorEvent?.camera?.id === camera.id,
    );
    expect(linked).toBeTruthy();
    expect(linked.detectorEvent.camera.name).toBe(camera.name);
    expect(linked.description).toContain(camera.name);

    const incidents = await req("GET", "/api/security/incidents", { token: superToken });
    const incidentWithCamera = incidents.body.items.find((inc: { alerts: Array<{ detectorEvent?: { camera?: { id: string } | null } | null }> }) =>
      inc.alerts.some((a) => a.detectorEvent?.camera?.id === camera.id),
    );
    expect(incidentWithCamera).toBeTruthy();
  });
});
