const numberEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

export type Config = ReturnType<typeof loadConfig>;
export function loadConfig() {
  return {
    port: numberEnv("PORT", 8000),
    databaseUrl:
      process.env.DATABASE_URL ??
      "postgresql://dormitory:dormitory@127.0.0.1:5433/dormitory",
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresSeconds: Math.max(300, numberEnv("JWT_EXPIRES_SECONDS", 86400)),
    cookieSecure: (process.env.COOKIE_SECURE ?? "false") === "true",
    resetDatabaseOnStart: false,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-5.6",
    openaiTimeoutMs: numberEnv("OPENAI_TIMEOUT_SECONDS", 8) * 1000,
    solverTimeLimitSeconds: Math.max(
      1,
      numberEnv("SOLVER_TIME_LIMIT_SECONDS", 2),
    ),
    solverWorkerUrl: process.env.SOLVER_WORKER_URL ?? "http://127.0.0.1:8010",
    waitSeconds: numberEnv("WAIT_SECONDS", 120),
    countdownSeconds: numberEnv("COUNTDOWN_SECONDS", 5),
    demoMode: (process.env.DEMO_MODE ?? "true") === "true",
    corsOrigins: (
      process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:5173"
    )
      .split(",")
      .map((s) => s.trim()),
    pythonCommand: process.env.PYTHON_COMMAND ?? "python",
  };
}
