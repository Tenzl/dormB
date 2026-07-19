import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { loadConfig, type Config } from "./config.js";
import { createDb, migrateDb } from "./db/index.js";
import { errorHandler } from "./errors.js";
import { registerRoutes } from "./routes.js";
import { resetSeed, seedIfEmpty } from "./seed.js";
import { tickCountdowns, tickMockGps } from "./services/delivery.js";

export async function buildApp(overrides: Partial<Config> = {}) {
  const loadedConfig = { ...loadConfig(), ...overrides };
  if (!loadedConfig.jwtSecret && !loadedConfig.demoMode)
    throw new Error("JWT_SECRET is required when DEMO_MODE is disabled");
  if (loadedConfig.jwtSecret && Buffer.byteLength(loadedConfig.jwtSecret) < 32)
    throw new Error("JWT_SECRET must be at least 32 bytes");
  const config = {
    ...loadedConfig,
    jwtSecret: loadedConfig.jwtSecret ?? randomBytes(32).toString("base64url"),
  };
  const { db, pool } = createDb(config.databaseUrl);
  await migrateDb(pool);
  if (config.resetDatabaseOnStart) await resetSeed(db);
  else await seedIfEmpty(db);
  const app = Fastify({ logger: false });
  app.decorate("jwtSecret", config.jwtSecret);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  app.setErrorHandler(errorHandler);
  registerRoutes(app, db, config);
  const countdownTimer = setInterval(
    () => void tickCountdowns(db).catch(console.error),
    250,
  );
  const gpsTimer = setInterval(
    () => void tickMockGps(db).catch(console.error),
    1000,
  );
  app.addHook("onClose", async () => {
    clearInterval(countdownTimer);
    clearInterval(gpsTimer);
    await pool.end();
  });
  return app;
}
