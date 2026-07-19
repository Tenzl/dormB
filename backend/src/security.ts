import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { jwtVerify, SignJWT } from "jose";
import type { AppDb } from "./db/index.js";
import { sessions, users } from "./db/schema.js";
import { ApiError } from "./errors.js";
import type { Role } from "./domain.js";

export const AUTH_COOKIE = "courtyard_session";
const JWT_ISSUER = "courtyard-api";
const JWT_AUDIENCE = "courtyard-web";
const secretKey = (secret: string) => new TextEncoder().encode(secret);

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}
export function verifyPassword(password: string, encoded: string) {
  const [salt, expected] = encoded.split(":");
  if (!salt || !expected) return false;
  const expectedBytes = Buffer.from(expected, "hex");
  const actualBytes = scryptSync(password, salt, 32);
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

export async function signAccessToken(
  userId: string,
  secret: string,
  expiresSeconds: number,
) {
  return new SignJWT({ token_use: "access" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setJti(randomBytes(16).toString("hex"))
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresSeconds)
    .sign(secretKey(secret));
}

export function requestAccessToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer "))
    return authorization.slice(7).trim();
  return request.cookies[AUTH_COOKIE];
}

export type Actor = {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  buildingId: string | null;
};
export async function authenticate(
  db: AppDb,
  request: FastifyRequest,
): Promise<Actor> {
  const token = requestAccessToken(request);
  if (!token)
    throw new ApiError(401, "unauthorized", "Missing authentication token");

  let subject: string | undefined;
  try {
    const verified = await jwtVerify(
      token,
      secretKey(
        (request.server as typeof request.server & { jwtSecret: string })
          .jwtSecret,
      ),
      {
        algorithms: ["HS256"],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );
    if (verified.payload.token_use !== "access")
      throw new Error("Unexpected token use");
    subject = verified.payload.sub;
  } catch {
    throw new ApiError(401, "unauthorized", "Invalid or expired JWT");
  }
  if (!subject)
    throw new ApiError(401, "unauthorized", "JWT subject is missing");

  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.userId, subject),
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);
  if (!rows[0])
    throw new ApiError(
      401,
      "unauthorized",
      "JWT session has been revoked or expired",
    );
  const user = rows[0].user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: JSON.parse(user.rolesJson),
    buildingId: user.buildingId,
  };
}
export function requireRole(actor: Actor, role: Role) {
  if (!actor.roles.includes(role))
    throw new ApiError(403, "forbidden", `${role} role required`);
}
