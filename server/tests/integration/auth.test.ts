import { beforeAll, describe, expect, it } from "vitest";
import { EMAILS, PASSWORD, getApp, login, req } from "../helpers.js";

let superToken = "";

beforeAll(async () => {
  await getApp();
  superToken = (await login(EMAILS.super)).accessToken;
});

async function createUser(email: string, password: string, role = "SECURITY") {
  const res = await req("POST", "/api/users", {
    token: superToken,
    payload: { email, name: "Test Account", role, password },
  });
  expect(res.status).toBeLessThan(300);
  return res.body;
}

describe("login", () => {
  it("returns tokens, profile and permissions for valid credentials", async () => {
    const body = await login(EMAILS.guard1);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.role).toBe("GUARD");
    expect(body.user.permissions).toContain("visitors:verify");
    expect(body.user.permissions).not.toContain("users:write");
    expect(body.expiresIn).toBeGreaterThan(0);
  });

  it("rejects invalid credentials", async () => {
    const res = await req("POST", "/api/auth/login", {
      payload: { email: EMAILS.guard1, password: "TotallyWrong1!" },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects unknown accounts with the same generic error", async () => {
    const res = await req("POST", "/api/auth/login", {
      payload: { email: "nobody@secureresident.local", password: "Whatever123!" },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("locks the account after 5 failed attempts", async () => {
    const email = "locktest@secureresident.local";
    await createUser(email, "LockTest@123!");

    for (let i = 0; i < 5; i++) {
      const fail = await req("POST", "/api/auth/login", { payload: { email, password: "WrongPass123!" } });
      expect(fail.status).toBe(401);
    }

    const locked = await req("POST", "/api/auth/login", { payload: { email, password: "LockTest@123!" } });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
  });
});

describe("tokens", () => {
  it("authenticates the access token against /api/auth/me", async () => {
    const { accessToken, refreshToken } = await login(EMAILS.security);
    const me = await req("GET", "/api/auth/me", { token: accessToken });
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(EMAILS.security);
    expect(me.body.role).toBe("SECURITY");

    const anon = await req("GET", "/api/auth/me");
    expect(anon.status).toBe(401);

    const bad = await req("GET", "/api/auth/me", { token: `${accessToken}tampered` });
    expect(bad.status).toBe(401);
    expect(refreshToken).toBeTruthy();
  });

  it("returns the permission list for the current user", async () => {
    const { accessToken } = await login(EMAILS.guard1);
    const res = await req("GET", "/api/auth/permissions", { token: accessToken });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("GUARD");
    expect(res.body.permissions).toContain("visitors:entry");
  });

  it("rotates refresh tokens and rejects reuse", async () => {
    const first = await login(EMAILS.fatima);

    const rotated = await req("POST", "/api/auth/refresh", {
      payload: { refreshToken: first.refreshToken },
    });
    expect(rotated.status).toBe(200);
    expect(rotated.body.accessToken).toBeTruthy();
    expect(rotated.body.refreshToken).not.toBe(first.refreshToken);

    const reuse = await req("POST", "/api/auth/refresh", {
      payload: { refreshToken: first.refreshToken },
    });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("INVALID_REFRESH_TOKEN");

    const rotatedAgain = await req("POST", "/api/auth/refresh", {
      payload: { refreshToken: rotated.body.refreshToken },
    });
    expect(rotatedAgain.status).toBe(200);
  });

  it("revokes all refresh tokens on logout", async () => {
    const session = await login(EMAILS.sara);
    const out = await req("POST", "/api/auth/logout", { token: session.accessToken });
    expect(out.status).toBe(200);

    const reuse = await req("POST", "/api/auth/refresh", {
      payload: { refreshToken: session.refreshToken },
    });
    expect(reuse.status).toBe(401);
  });

  it("rejects garbage refresh tokens", async () => {
    const res = await req("POST", "/api/auth/refresh", {
      payload: { refreshToken: "x".repeat(40) },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });
});

describe("change password", () => {
  it("requires the current password and enforces policy", async () => {
    const email = "pwtest@secureresident.local";
    await createUser(email, "Original@123!");
    const session = await login(email, "Original@123!");

    const wrongCurrent = await req("POST", "/api/auth/change-password", {
      token: session.accessToken,
      payload: { currentPassword: "Nope1234567!", newPassword: "NewStrong@123" },
    });
    expect(wrongCurrent.status).toBe(401);

    const weak = await req("POST", "/api/auth/change-password", {
      token: session.accessToken,
      payload: { currentPassword: "Original@123!", newPassword: "alllowercaseonly" },
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe("WEAK_PASSWORD");

    const ok = await req("POST", "/api/auth/change-password", {
      token: session.accessToken,
      payload: { currentPassword: "Original@123!", newPassword: "NewStrong@123" },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.sessionsRevoked).toBe(true);

    const oldLogin = await req("POST", "/api/auth/login", { payload: { email, password: "Original@123!" } });
    expect(oldLogin.status).toBe(401);

    await login(email, "NewStrong@123");
  });
});

describe("authorization boundaries", () => {
  it("residents cannot read the user directory", async () => {
    const { accessToken } = await login(EMAILS.ali);
    const res = await req("GET", "/api/users", { token: accessToken });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("MISSING_PERMISSION");
  });

  it("requires authentication for protected routes", async () => {
    const res = await req("GET", "/api/users");
    expect(res.status).toBe(401);
  });
});
