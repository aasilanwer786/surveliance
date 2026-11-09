import { beforeAll, describe, expect, it } from "vitest";
import { EMAILS, getApp, login, req } from "../helpers.js";

let superToken = "";
let securityToken = "";

beforeAll(async () => {
  await getApp();
  superToken = (await login(EMAILS.super)).accessToken;
  securityToken = (await login(EMAILS.security)).accessToken;
});

describe("system settings", () => {
  it("lets the super admin read and update settings", async () => {
    const read = await req("GET", "/api/settings", { token: superToken });
    expect(read.status).toBe(200);
    expect(typeof read.body.systemName).toBe("string");

    const original = read.body.systemName;
    try {
      const saved = await req("PUT", "/api/settings", {
        token: superToken,
        payload: { systemName: "SecureResident Test" },
      });
      expect(saved.status).toBe(200);
      expect(saved.body.updated).toContain("systemName");

      const after = await req("GET", "/api/settings", { token: superToken });
      expect(after.body.systemName).toBe("SecureResident Test");
    } finally {
      await req("PUT", "/api/settings", { token: superToken, payload: { systemName: original } });
    }
  });

  it("blocks security staff from updating settings", async () => {
    const saved = await req("PUT", "/api/settings", {
      token: securityToken,
      payload: { systemName: "Hijacked" },
    });
    expect(saved.status).toBe(403);
  });

  it("returns every permission for the super admin profile", async () => {
    const me = await req("GET", "/api/auth/me", { token: superToken });
    expect(me.status).toBe(200);
    expect(me.body.role).toBe("SUPER_ADMIN");
    expect(me.body.permissions).toContain("settings:write");
  });
});
