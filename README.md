# Courtyard — AI-Orchestrated Dormitory Batch Delivery

Courtyard is a deterministic local MVP for coordinating food delivery by dormitory building. An approved student shipper locks all eligible `READY` orders for one merchant, reviews a GPT-5.6-informed route calculated by OR-Tools, confirms it, and executes primary delivery plus one controlled redelivery pass.

The product contract is [`spec_final.md`](./spec_final.md). Requirement-level verification is tracked in [`docs/SPEC_MATRIX.md`](./docs/SPEC_MATRIX.md).

## Architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Web | React 19, Vite, TypeScript, Tailwind CSS 4, MapLibre GL | Public product landing page; separate Admin, Merchant, and Shipper portals; Student tracking; real KTX Khu B street map and mock-GPS route |
| API | Node.js 22, Fastify, TypeScript, Zod | Session identity, authorization, domain transitions, persistence, AI/solver validation, idempotency |
| Data | PostgreSQL 17+, Drizzle ORM | Local durable state, indexed operational queries, migrations, and deterministic reset |
| AI | OpenAI structured output | Produces a validated optimization policy and explanation; never writes business state |
| Solver | Python, FastAPI, OR-Tools | Separately hosted stateless HTTP worker; `POST /solve` returns a route result and `GET /health` reports readiness |

The TypeScript API is the trust boundary. It validates the operational snapshot, OpenAI output, and Python solver result before presenting or applying a route. Authentication uses signed, expiring JWT access tokens in an HttpOnly cookie; a hashed session allowlist makes logout immediately revocable. The Python worker does not authenticate users or access the database. The API calls it through `SOLVER_WORKER_URL` with a bounded timeout and keeps current state unchanged when the worker is unavailable or returns invalid output.

The versioned OpenAI policy prompt lives in `backend/src/prompts/optimization-policy.ts`. It explains the campus-gate origin, eligible-order snapshot, retry/waiting/freshness/batch priorities, legal travel-time matrix, closed-road semantics, and the boundary between AI policy analysis and OR-Tools route solving. The backend requires one priority entry per candidate building and rejects missing, duplicated, invented, or tampered unavailable-building data. When `OPENAI_API_KEY` is empty, the same rules are represented by a deterministic fallback policy instead of an OpenAI call.

Students may place any number of independent orders. Repeatedly ordering from one merchant creates separate order records, and ordering from several merchants keeps merchant ownership intact so each order is prepared and batched only by its own merchant. The create-order API accepts only a product identifier; it derives the merchant from the product and the pickup building from the authenticated student.

Campus map data is versioned in `backend/src/data/campus-layout.json` and `backend/src/data/campus-route-segments.json`. The layout covers all 25 OSM-labeled residence buildings in KTX Khu B; the initial delivery dataset has five fixed pickup points, one internal dispatch point on the lower service road, and all 15 pairwise road geometries as GeoJSON `[longitude, latitude]`. Four long-closed perimeter gates are modeled as forbidden access points with an 18-meter exclusion radius. The central park and its pedestrian-only paths are modeled as an operator-confirmed restricted polygon; the backend rejects any stored segment that enters or crosses it. The data was generated from OpenStreetMap/OSRM and then corrected with manual access rules. It is served locally at `GET /api/v1/campus/layout` and `GET /api/v1/campus/route-segments`; production runtime does not call a routing provider. MapLibre keeps the full campus in view, renders OpenFreeMap tiles, displays the restricted area, and highlights the active delivery buildings while the API composes route sections and advances mock GPS along the exact active LineString.

Admin, Merchant, and Shipper workspaces use the full operational map. The Student map is deliberately narrower: it marks only that student's pickup building and the shipper's current position. The API withholds route geometry and peer stops until the shipper announces **Heading to this building** for the student's own stop; it then returns only the clipped route from the current GPS point to that pickup building. This privacy boundary is enforced by the backend projection, not just hidden with CSS.

## Prerequisites

- Node.js 22 and npm
- Python 3.10 or newer, available as `python`
- PowerShell 7 recommended on Windows
- PostgreSQL 17+ installed and running locally (Windows service or equivalent)
- An OpenAI API key is optional. Without one, the demo uses its deterministic route-policy fallback.

Docker is not required.

## First-time setup

From `D:\openAI\dormitoryB`:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
.\scripts\Setup-Postgres.ps1
.\scripts\Start-Demo.ps1 -Install
```

`Setup-Postgres.ps1` creates the `dormitory` role plus the `dormitory` and `dormitory_test` databases on `127.0.0.1:5432`. It prompts for your local PostgreSQL superuser password (usually `postgres`).

`-Install` installs backend/frontend npm packages, creates `.venv`, and installs the top-level OR-Tools worker requirements. Later runs only need:

```powershell
.\scripts\Start-Demo.ps1
```

Open [http://localhost:5173](http://localhost:5173) for the product landing page or [http://localhost:5173/login](http://localhost:5173/login) to sign in. Authenticated workspaces use explicit paths: `/admin`, `/merchant`, `/shipper`, and the preserved student tracker at `/student`. The API health endpoint is [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health), and the solver health endpoint is [http://127.0.0.1:8010/health](http://127.0.0.1:8010/health). `Start-Demo.ps1 -OpenBrowser` opens the web app after all three services are ready.

The start script loads private server configuration from `backend/.env`. Vite loads public browser configuration from `frontend/.env`. It checks that local PostgreSQL is accepting connections, prepends `.venv\Scripts` to `PATH`, and starts the solver, API, and frontend in the background. It records process IDs in `.demo-processes.json` and writes logs under `.demo-logs`. The backend reaches the worker over `SOLVER_WORKER_URL`; the worker remains separately hosted and has no database access. Stopping the demo leaves PostgreSQL running as your system service.

## Demo accounts

Sign in with the email and password form. The five seeded users are separate PostgreSQL accounts with role-derived workspaces:

| Persona | Email | Role |
|---|---|---|
| Mai Pham | `admin@demo.local` | Admin; reviews merchants and monitors all active routes |
| An Tran | `student@demo.local` | Student at C3 |
| Linh Nguyen | `merchant@demo.local` | Green Bowl merchant |
| Quynh Ho | `pending-merchant@demo.local` | Merchant awaiting Admin approval |
| Binh Le | `shipper@demo.local` | Approved Green Bowl Shipper; also a Student |

All seeded accounts use password `demo123`. The UI is the preferred sign-in path.

## Five-minute happy-path demo

1. Reset the dataset with `.\scripts\Reset-Demo.ps1`.
2. Sign in as Linh Nguyen and advance a non-ready order through its legal preparation transitions until `READY`.
3. Review the pending shipper application. Approve it to demonstrate merchant-owned recruitment, or keep Binh Le as the already approved delivery persona.
4. Switch to Binh Le and press **Ready to Deliver**. Confirm that all eligible Green Bowl orders are grouped into one stop per building and that the screen says **Recommended Route**, not “optimal route.”
5. Review included orders, duration, and the AI explanation. Confirm the route, observe the cancellable five-second countdown, and let the trip start.
6. Before announcing, switch to the affected Student account: the confirmed order, shipper marker, and student's own pickup building are visible, but no route is returned. Back as Shipper, press **Heading to this building**; the Student then receives only the route to that building. Arrive at the stop. **Delivered** is available immediately; **Customer unavailable** stays locked for two minutes.
7. Mark an order `TEMP_WAITING`, switch to its Student view, press **I Am Ready**, finish all primary stops, then confirm the generated redelivery route. A retry ends only as `DELIVERED` or `FAILED_DELIVERY`.
8. Use mock movement controls to show deterministic five-second location updates, map interpolation, ETA refresh, and state persistence across reload.

## Reset, stop, and logs

Reset a running demo through the authenticated demo API:

```powershell
.\scripts\Reset-Demo.ps1
```

For an offline database reset, stop services first:

```powershell
.\scripts\Stop-Demo.ps1
.\scripts\Reset-Demo.ps1 -Offline
```

Stop only the processes recorded by the start script:

```powershell
.\scripts\Stop-Demo.ps1
```

If startup fails, inspect the newest files in `.demo-logs`. Common causes are a missing `.venv`/OR-Tools install, PostgreSQL not running or not bootstrapped (`.\scripts\Setup-Postgres.ps1`), ports 5173 or 8000 already in use, or an invalid API key.

## Manual development commands

Ensure PostgreSQL is running and bootstrapped, then open three terminals:

```powershell
# Terminal 1
Set-Location solver-worker
..\.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8010

# Terminal 2
Set-Location backend
npm run seed:reset
npm run dev

# Terminal 3
Set-Location frontend
npm run dev
```

The Vite server proxies `/api` explicitly to `http://127.0.0.1:8000` to avoid IPv4/IPv6 `localhost` ambiguity on Windows. Backend npm scripts load `backend/.env`; Vite automatically loads `frontend/.env`.

## Validation

Run backend and frontend checks independently:

```powershell
npm --prefix backend run build
npm --prefix backend test
npm --prefix frontend run build
npm --prefix frontend test
.\.venv\Scripts\python -m pytest solver-worker -q
```

Route generation also requires Python dependencies:

```powershell
.\.venv\Scripts\python -m pip install -r solver-worker\requirements.txt
```

Before calling the MVP done, update [`docs/SPEC_MATRIX.md`](./docs/SPEC_MATRIX.md) with exact passing evidence. Pay particular attention to cross-merchant authorization, atomic trip locking, server-authoritative timers, idempotency, snapshot privacy, invalid AI/solver outputs, reload persistence, and route immutability.

## Environment reference

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8000` | Fastify API port |
| `DATABASE_URL` | `postgresql://dormitory:dormitory@127.0.0.1:5432/dormitory` | Local PostgreSQL connection string used by the API |
| `JWT_SECRET` | generated ephemerally in demo mode | JWT signing secret; required when `DEMO_MODE=false` |
| `JWT_EXPIRES_SECONDS` | `86400` | Access-token lifetime |
| `COOKIE_SECURE` | `false` | Set `true` behind production HTTPS |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed browser origin(s) |
| `DEMO_MODE` | `true` | Enables seeded sign-in/reset and mock controls |
| `OPENAI_API_KEY` | empty | Optional OpenAI credential; never commit it |
| `OPENAI_MODEL` | `gpt-5.6` | Structured policy-analysis model |
| `OPENAI_TIMEOUT_SECONDS` | `8` | AI request bound |
| `SOLVER_WORKER_URL` | `http://127.0.0.1:8010` | Stateless FastAPI solver base URL |
| `SOLVER_TIME_LIMIT_SECONDS` | `2` | OR-Tools solve bound |
| `WAIT_SECONDS` | `120` | Minimum stop wait before unavailable/failure actions |
| `COUNTDOWN_SECONDS` | `5` | Cancellable route activation countdown |
| `MOCK_GPS_INTERVAL_MS` | `1000` | Demo GPS publish interval after route activation |
| `VITE_API_URL` | `/api/v1` | Frontend API base path |
| `VITE_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/positron` | Public MapLibre style URL; contains no secret |

Never expose `OPENAI_API_KEY` through `VITE_*` variables or send it to the browser.
