import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { randomToken, sha256 } from "./codes.js";

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function issueTokens(app: FastifyInstance, userId: string, role: string): Promise<IssuedTokens> {
  const accessToken = app.jwt.sign({ sub: userId, role }, { expiresIn: config.jwt.accessTtl });
  const refreshToken = randomToken(48);
  await prisma.refreshToken.create({
    data: {
      tokenHash: sha256(refreshToken),
      userId,
      expiresAt: new Date(Date.now() + config.jwt.refreshTtlSeconds * 1000),
    },
  });
  return { accessToken, refreshToken, expiresIn: config.jwt.accessTtlSeconds };
}
