# Courtyard frontend

Responsive React + TypeScript client for the dormitory batch-delivery MVP. It contains a public landing page and dedicated Admin, Merchant, Shipper, and Student workspaces.

## Run locally

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Vite loads `frontend/.env` automatically and proxies `/api` to `http://127.0.0.1:8000`. Only public `VITE_*` values belong in this file; JWT secrets and database credentials belong in `backend/.env`.

The normal application never falls back after an API error. To run a deliberately isolated UI demo without a backend, set `VITE_STANDALONE_DEMO=true`. This mode is visibly labelled and does not claim to persist server writes.

Seeded backend credentials use password `demo123`:

- `admin@demo.local`
- `student@demo.local`
- `merchant@demo.local`
- `pending-merchant@demo.local`
- `shipper@demo.local`

## Checks

```bash
npm run build
npm test
```

Tests cover bearer auth and API envelopes, idempotency headers, nested backend errors, seeded persona selection, and the two-minute unavailable-action lock using a persisted server deadline.

## UI architecture

- `src/lib/api.ts`: `/api/v1` contract, bearer token, idempotency keys, DTO normalization.
- `src/state/AppContext.tsx`: authenticated role state, actions, polling, feedback.
- `src/screens`: Student, Merchant, Shipper, and sign-in workspaces.
- `src/components`: accessible primitives, app shell, route sequence, and 2D campus map.
- `DESIGN.md`: visual rules and audit checklist.

Live projections poll every two seconds. Mock GPS publication remains a backend-controlled five-second cadence; marker movement interpolates with transform-only CSS and respects reduced motion.
