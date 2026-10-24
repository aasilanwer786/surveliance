import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

let appPromise: Promise<FastifyInstance> | null = null;

export function getApp(): Promise<FastifyInstance> {
  if (!appPromise) appPromise = buildApp();
  return appPromise;
}

export const PASSWORD = "Secure@Demo123!";

export const EMAILS = {
  super: "superadmin@secureresident.local",
  admin: "admin@secureresident.local",
  security: "security@secureresident.local",
  guard1: "guard1@secureresident.local",
  guard2: "guard2@secureresident.local",
  ali: "ali@resident.local",
  hamza: "hamza@resident.local",
  fatima: "fatima@resident.local",
  sara: "sara@resident.local",
} as const;

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; role: string; email: string; permissions: string[]; [k: string]: unknown };
}

export interface ApiResult {
  status: number;
  body: any;
}

export async function login(email: string, password: string = PASSWORD): Promise<LoginResponse> {
  const app = await getApp();
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed for ${email}: ${res.statusCode} ${res.body}`);
  return res.json();
}

export async function req(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  opts: { token?: string; payload?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult> {
  const app = await getApp();
  const res = await app.inject({
    method,
    url,
    payload: opts.payload as never,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
  });
  let body: unknown = null;
  try {
    body = JSON.parse(res.body);
  } catch {
    body = res.body;
  }
  return { status: res.statusCode, body };
}

export async function getMainGateId(token: string): Promise<string> {
  const res = await req("GET", "/api/gates", { token });
  const gate = res.body.items?.find((g: { code: string }) => g.code === "MAIN-1");
  if (!gate) throw new Error(`MAIN-1 gate not found: ${JSON.stringify(res.body)}`);
  return gate.id;
}

export async function createInvitation(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ invitation: any; qrDataUrl: string }> {
  const res = await req("POST", "/api/visitors/invitations", {
    token,
    payload: {
      visitorName: "Test Visitor",
      expectedAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      ...overrides,
    },
  });
  if (res.status >= 400) throw new Error(`createInvitation failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
