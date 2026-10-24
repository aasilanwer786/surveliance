import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import type { Permission } from "./lib/rbac.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  apartmentIds: string[];
  residentIds: string[];
}

export interface AuthContext {
  user: AuthUser;
  permissions: Permission[];
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    optionalAuthenticate: preHandlerHookHandler;
    requirePermission: (...perms: Permission[]) => { preHandler: preHandlerHookHandler[] };
    requireAnyRole: (...roles: string[]) => { preHandler: preHandlerHookHandler[] };
  }
}

export function authOf(req: FastifyRequest): AuthContext {
  if (!req.auth) {
    throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  }
  return req.auth;
}
