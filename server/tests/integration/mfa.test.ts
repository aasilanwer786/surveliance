import { beforeAll, describe, expect, it } from "vitest";
import { EMAILS, getApp, login, req } from "../helpers.js";
import { generateTotpCode } from "../../src/lib/totp.js";

const MFA_EMAIL = "mfa.tester@secureresident.local";
const MFA_PASSWORD = "Mfa#Demo12345";

let superToken = "";
let token = "";
let secret = "";
let challengeToken = "";
let recoveryCodes: string[] = [];

async function passwordLogin() {
  return req("POST", "/api/auth/login", { payload: { email: MFA_EMAIL, password: MFA_PASSWORD } });
}

beforeAll(async () => {
  await getApp();
  superToken = (await login(EMAILS.super)).accessToken;
  const created = await req("POST", "/api/users", {
    token: superToken,
    payload: { email: MFA_EMAIL, name: "MFA Tester", role: "SECURITY", password: MFA_PASSWORD },
  });
  expect(created.status).toBeLessThan(300);

  const firstLogin = await passwordLogin();
  expect(firstLogin.status).toBe(200);
  token = firstLogin.body.accessToken;
  expect(token).toBeTruthy();
});

describe("MFA enrolment", () => {
  it("starts setup and returns a scannable QR code", async () => {
    const res = await req("POST", "/api/auth/mfa/setup", { token });
    expect(res.status).toBe(200);
    expect(res.body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(res.body.otpauthUrl.startsWith("otpauth://totp/")).toBe(true);
    expect(res.body.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    secret = res.body.secret;
  });

  it("rejects an invalid confirmation code", async () => {
    const res = await req("POST", "/api/auth/mfa/enable", { token, payload: { code: "000000" } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_MFA_CODE");
  });

  it("enables MFA and returns one-time recovery codes", async () => {
    const res = await req("POST", "/api/auth/mfa/enable", {
      token,
      payload: { code: generateTotpCode(secret) },
    });
    expect(res.status).toBe(200);
    expect(res.body.recoveryCodes).toHaveLength(8);
    recoveryCodes = res.body.recoveryCodes;
  });
});

describe("MFA login", () => {
  it("returns an MFA challenge instead of tokens", async () => {
    const res = await passwordLogin();
    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(true);
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.challengeToken).toBeTruthy();
    challengeToken = res.body.challengeToken;
  });

  it("rejects the challenge token as an access token", async () => {
    const res = await req("GET", "/api/auth/me", { token: challengeToken });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong code", async () => {
    const res = await req("POST", "/api/auth/mfa/verify", {
      payload: { challengeToken, code: "000000" },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_MFA_CODE");
  });

  it("completes login with a valid authenticator code", async () => {
    const res = await req("POST", "/api/auth/mfa/verify", {
      payload: { challengeToken, code: generateTotpCode(secret) },
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.mfaEnabled).toBe(true);
    expect(res.body.user.permissions).toContain("visitors:verify");
  });

  it("accepts a recovery code once and burns it", async () => {
    const first = await passwordLogin();
    const code = recoveryCodes[0];
    const ok = await req("POST", "/api/auth/mfa/verify", {
      payload: { challengeToken: first.body.challengeToken, code },
    });
    expect(ok.status).toBe(200);

    const second = await passwordLogin();
    const reused = await req("POST", "/api/auth/mfa/verify", {
      payload: { challengeToken: second.body.challengeToken, code },
    });
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe("INVALID_MFA_CODE");
  });

  it("regenerates recovery codes, invalidating the previous set", async () => {
    const challenge = await passwordLogin();
    const verified = await req("POST", "/api/auth/mfa/verify", {
      payload: { challengeToken: challenge.body.challengeToken, code: generateTotpCode(secret) },
    });
    expect(verified.status).toBe(200);

    const oldCode = recoveryCodes[1];
    const regen = await req("POST", "/api/auth/mfa/recovery-codes", {
      token: verified.body.accessToken,
      payload: { code: generateTotpCode(secret) },
    });
    expect(regen.status).toBe(200);
    expect(regen.body.recoveryCodes).toHaveLength(8);
    recoveryCodes = regen.body.recoveryCodes;

    const oldLogin = await passwordLogin();
    const oldTry = await req("POST", "/api/auth/mfa/verify", {
      payload: { challengeToken: oldLogin.body.challengeToken, code: oldCode },
    });
    expect(oldTry.status).toBe(401);

    const newLogin = await passwordLogin();
    const newTry = await req("POST", "/api/auth/mfa/verify", {
      payload: { challengeToken: newLogin.body.challengeToken, code: recoveryCodes[0] },
    });
    expect(newTry.status).toBe(200);
  });

  it("disables MFA with the password and a current code", async () => {
    const challenge = await passwordLogin();
    const verified = await req("POST", "/api/auth/mfa/verify", {
      payload: { challengeToken: challenge.body.challengeToken, code: generateTotpCode(secret) },
    });
    expect(verified.status).toBe(200);

    const disabled = await req("POST", "/api/auth/mfa/disable", {
      token: verified.body.accessToken,
      payload: { password: MFA_PASSWORD, code: generateTotpCode(secret) },
    });
    expect(disabled.status).toBe(200);

    const after = await passwordLogin();
    expect(after.status).toBe(200);
    expect(after.body.mfaRequired).toBeUndefined();
    expect(after.body.accessToken).toBeTruthy();
    expect(after.body.user.mfaEnabled).toBe(false);
  });
});
