import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { permissionsForRole, hasPermission, ROLES } from "../lib/rbac.js";
import type { Permission } from "../lib/rbac.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import type { AuthContext, AuthUser } from "../types.js";

async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, status: "ACTIVE", deletedAt: null },
    include: { residents: { where: { status: "ACTIVE", deletedAt: null } } },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    apartmentIds: user.residents.map((r) => r.apartmentId),
    residentIds: user.residents.map((r) => r.id),
  };
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const q = (req.query as Record<string, string> | undefined)?.access_token;
  if (typeof q === "string" && q.length > 0) return q;
  return null;
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorate("authenticate", async (req: FastifyRequest) => {
    const token = extractToken(req);
    if (!token) throw unauthorized("Missing access token");
    let payload: { sub: string };
    try {
      payload = app.jwt.verify(token) as { sub: string };
    } catch {
      throw unauthorized("Invalid or expired access token", "INVALID_TOKEN");
    }
    const user = await loadAuthUser(payload.sub);
    if (!user) throw unauthorized("Account is disabled or no longer exists", "ACCOUNT_DISABLED");
    const ctx: AuthContext = { user, permissions: permissionsForRole(user.role) };
    req.auth = ctx;
  });

  app.decorate("optionalAuthenticate", async (req: FastifyRequest) => {
    const token = extractToken(req);
    if (!token) return;
    try {
      const payload = app.jwt.verify(token) as { sub: string };
      const user = await loadAuthUser(payload.sub);
      if (user) req.auth = { user, permissions: permissionsForRole(user.role) };
    } catch {
      // anonymous access continues
    }
  });

  app.decorate("requirePermission", (...perms: Permission[]) => ({
    preHandler: [
      app.authenticate,
      async (req: FastifyRequest) => {
        const auth = req.auth!;
        if (!perms.some((p) => auth.permissions.includes(p))) {
          throw forbidden(`Missing permission: ${perms.join(" or ")}`, "MISSING_PERMISSION");
        }
      },
    ],
  }));

  app.decorate("requireAnyRole", (...roles: string[]) => ({
    preHandler: [
      app.authenticate,
      async (req: FastifyRequest) => {
        if (!roles.includes(req.auth!.user.role)) {
          throw forbidden("Insufficient role", "INSUFFICIENT_ROLE");
        }
      },
    ],
  }));
});
