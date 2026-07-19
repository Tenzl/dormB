# Dormitory Batch Delivery API

TypeScript/Fastify API with Drizzle ORM and PostgreSQL 17. Route policy is produced by OpenAI structured output (`gpt-5.6` by default) with a deterministic fallback. Feasible route calculation is delegated to the stateless OR-Tools HTTP worker in `../solver-worker` and every result is validated by this API before persistence.

## Run locally

```powershell
cd D:\openAI\dormitoryB\backend
Copy-Item .env.example .env
npm install
docker compose --project-directory .. up -d --wait postgres
npm run seed:reset
npm run dev
```

The API listens on `http://localhost:8000`; health is `GET /health`, OpenAPI-style route discovery is represented by the Fastify routes, and all product endpoints are under `/api/v1`. Start the solver separately on port 8010 as documented in `../solver-worker/README.md`. If the worker or OpenAI is unavailable, the API uses a labeled deterministic fallback without allowing either external component to write application state.

Demo accounts use password `demo123`. Login with `POST /api/v1/auth/login`; browser clients receive an HttpOnly JWT cookie. API clients can request a token by adding `X-Auth-Transport: bearer`, then send it as `Authorization: Bearer <jwt>`. JWT signature, issuer, audience and expiration are verified on every protected request, and logout revokes the hashed session record. Every mutation other than login/logout requires an `Idempotency-Key` header of 8–128 characters.

Key environment variables are `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_SECONDS`, `COOKIE_SECURE`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TIMEOUT_SECONDS`, `SOLVER_WORKER_URL`, `SOLVER_TIME_LIMIT_SECONDS`, `WAIT_SECONDS`, `COUNTDOWN_SECONDS`, `DEMO_MODE`, and `CORS_ORIGINS`.

## Verification

```powershell
npm run build
npm test
npm audit --omit=dev
```

Success responses use `{ "data": ... }` (paginated collections also include `meta`). Errors use `{ "error": { "code", "message", "details?" } }`. Active state can be restored with `GET /api/v1/trips/active`; countdown targets, stop wait deadlines, route recommendation, orders, stops, and persisted mock GPS state are included.
