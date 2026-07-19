# Specification Traceability Matrix

Source of truth: [`spec_final.md`](../spec_final.md), final draft dated 2026-07-19.

This matrix is the release checklist for the MVP. `Planned` means the verification is required but its implementation evidence has not yet been confirmed in the integrated tree. During final review, replace `Planned` with `Pass`, `Fail`, or `N/A` and add the exact test/file/demo evidence. A UI-only demonstration is not sufficient for an authorization, ownership, idempotency, transition, locking, AI-validation, or persistence rule.

## Confirmed implementation architecture

- The responsive React/Vite frontend is TypeScript.
- The Fastify API, domain rules, persistence orchestration, OpenAI adapter, snapshot allowlist, and solver-result validation are TypeScript.
- A small, separately hosted Python/FastAPI worker at `solver-worker/` is permitted only as the OR-Tools execution boundary because there is no official TypeScript OR-Tools binding. Its `POST /solve` accepts a controlled JSON contract and returns only a `SolverResult`; it is stateless and must not own authentication, authorization, domain transitions, or database access.
- The TypeScript backend remains the trust boundary: it calls `SOLVER_WORKER_URL`, validates worker input/output, enforces a bounded HTTP timeout, and leaves current state unchanged on network, timeout, infeasible, or invalid-result failure.
- PostgreSQL 17 is the only application database. Drizzle uses PostgreSQL-native transactions, `FOR UPDATE` batch claims, partial uniqueness for active memberships, and indexed merchant/trip/order access paths.

## Approved product extension: Admin and merchant onboarding

| ID | Requirement | Verification | Status |
|---|---|---|---|
| EXT-001 | Admin uses a separate role/account | `admin@demo.local`; backend role guard and frontend Admin workspace | Pass |
| EXT-002 | Admin lists and approves/rejects merchant accounts | Admin merchant API/UI; integration test denies non-admin and unlocks approved merchant | Pass |
| EXT-003 | Pending merchant uses a separate account but cannot operate | `pending-merchant@demo.local`; operational API returns 403 before approval | Pass |
| EXT-004 | Admin can view every active shipper route | Admin trip list/detail API and integration test | Pass |
| EXT-005 | Admin and Merchant tracking place the map above route information | Shared `RouteOverview`; wide map followed by status and sequence | Pass |
| EXT-006 | Admin can switch among multiple concurrent active routes | Route selector backed by the full admin active-trip collection; frontend regression test | Pass |
| EXT-007 | A logged-in pending merchant unlocks after Admin approval | Polling refreshes `/auth/me` and updates merchant session status without another sign-in | Pass |
| EXT-008 | Student route access does not expose peer orders or optimization snapshots | Actor-specific trip projection and PostgreSQL integration test | Pass |
| EXT-009 | Five users authenticate through a normal login form without an account picker | Email/password form; backend-derived active role; five separate seeded PostgreSQL users | Pass |
| EXT-010 | Browser authentication uses revocable JWT | HS256 JWT with issuer/audience/expiry validation, HttpOnly SameSite cookie, hashed session allowlist, logout revocation and login rate limit | Pass |
| EXT-011 | The public product landing page remains available without a session | `/` renders `LandingPage`; focused landing and application-routing regression tests | Pass |
| EXT-012 | Each authenticated role has a dedicated, authorization-aware workspace route | `/admin`, `/merchant`, `/shipper`, and `/student`; routing tests cover signed-out redirect, authorized rendering, and unauthorized-role redirect | Pass |
| EXT-013 | A student can place multiple independent orders at one or several approved merchants | `POST /student/orders` derives merchant/building server-side; student UI lists every active order and groups products by merchant; backend test creates two same-merchant orders and one cross-merchant order | Pass |

## Approved product extension: MapLibre campus routing

Source addendum: [`huong-dan-maplibre-ortools-ktx.md`](../huong-dan-maplibre-ortools-ktx.md).

| ID | Requirement | Verification | Status |
|---|---|---|---|
| MAP-001 | Map loads the complete KTX Khu B area and uses real coordinates | Campus layout API exposes all 25 OSM-labeled residence buildings (B1–B5, BA1–BA5, C1–C6, D2–D6, E1–E4); delivery pickup points remain fixed | Pass |
| MAP-002 | Route follows internal roads, not straight lines between buildings | Versioned 15-pair GeoJSON dataset generated once from OSM/OSRM and validated at startup | Pass |
| MAP-003 | Runtime does not depend on a routing service | `/campus/route-segments` serves committed data; `runtimeRoutingDependency=false` | Pass |
| MAP-004 | Travel matrix and displayed route use the same segment dataset | `buildTravelTimeMatrix` and `buildRouteSections` share `campus-routing.ts`; pure tests cover both | Pass |
| MAP-005 | Solver includes dispatch-to-first-building cost and rejects incomplete matrices | `startLocationId=CAMPUS_DEPOT`; worker has no geodesic/default-cost fallback | Pass |
| MAP-006 | MapLibre layers distinguish completed, active, and remaining route | One GeoJSON source with casing, completed gray, remaining pale green, active emerald layers | Pass |
| MAP-007 | Mock GPS follows the active route and stops at the end | `advanceMockGps` projects onto the composed LineString, advances one coordinate per configured tick, waits at `currentStopId`, and resumes only after stop completion | Pass |
| MAP-008 | Map remains usable and calm | Campus max bounds, zoom 15–20, no pitch/rotate/world copies, cooperative gestures, route-only fitBounds | Pass |
| MAP-009 | Map is accessible and resilient | Stable region label, live progress summary, textual route sequence, reduced motion, and map fallback | Pass |

## Evidence conventions

| Prefix | Evidence type |
|---|---|
| `UT` | Unit test for a pure policy, state machine, schema, or route validator |
| `IT` | API/integration test against persisted state and authenticated identity |
| `CT` | HTTP contract test: method, status, envelope, validation, and error code |
| `E2E` | Browser journey across roles |
| `VIS` | Responsive/accessibility/design-system inspection |
| `OPS` | Local run, reset, timeout, recovery, or deterministic-demo check |

## Business rules

| ID | Rule | Required evidence | Verification | Status |
|---|---|---|---|---|
| BR-001 | Every domain record is merchant-owned | Repository/service ownership predicates; cross-merchant API tests | API smoke: foreign merchant trip read returned 403; full resource matrix still needed | Pass (trip smoke) |
| BR-002 | One active merchant membership per student | Database uniqueness/transactional service guard | Backend test approves membership then verifies second merchant approval returns 409 | Pass |
| BR-003 | Only an approved active shipper creates a trip | Session-derived actor plus active membership guard | `IT-BR-003` unapproved, inactive, and wrong-merchant actors are denied | Planned |
| BR-004 | One building per stop in each pass | Group-by-building trip builder | API smoke: 3 READY orders in 2 seeded buildings produced 2 stops | Pass (primary smoke) |
| BR-005 | One fixed building pickup point; no room delivery | Seed/model contains pickup coordinates only | `IT-BR-005` trip snapshot uses building pickup point and exposes no room target | Planned |
| BR-006 | Trip selects only eligible READY orders | Eligibility policy scoped by merchant/status/trip/cancel/delivery | API smoke: 3 own READY orders selected; own PREPARING and foreign READY excluded | Pass (smoke) |
| BR-007 | Eligible orders are atomically locked | Transaction/compare-and-set around trip generation | Backend concurrent Ready test returns one 201/one 409 and one 3-order trip | Pass |
| BR-008 | Later-ready orders stay for a future trip | Immutable trip membership after lock | Backend test marks F1 READY after generation and confirms exclusion | Pass |
| BR-009 | Upcoming-building notification is grouped operationally | Building announcement event with per-user dedupe keys | `IT-BR-009` one affected-user notice each, no duplicates | Planned |
| BR-010 | Outcomes remain per order | Per-order transition endpoint/service | `IT-BR-010` changing one order does not change siblings at the stop | Planned |
| BR-011 | Unavailable is locked for two minutes | Server-authoritative `minimumWaitEndsAt` guard | API smoke: TEMP_WAITING immediately after arrival returned 409 while DELIVERED returned 200 | Pass (pre-deadline smoke) |
| BR-012 | Timer expiry never changes order state | Unlock event separated from order transition | `IT-BR-012` advancing clock past deadline leaves status unchanged | Planned |
| BR-013 | TEMP_WAITING may be delivered while stop is ARRIVED | Explicit late-arrival transition | `IT-BR-013` transition succeeds before stop completion | Planned |
| BR-014 | After stop completion, waiting order is redelivery-only | State guard on primary delivery action | `IT-BR-014` primary delivery mutation is rejected after completion | Planned |
| BR-015 | One retry maximum | `deliveryAttempt` invariant and transition guard | `IT-BR-015` second redelivery enqueue is rejected | Planned |
| BR-016 | Only TEMP_WAITING_READY enters redelivery | Redelivery eligibility policy | `UT-BR-016` mixed waiting fixture includes ready orders only | Planned |
| BR-017 | Unready waiting orders fail when redelivery ends | Trip closing transaction | `IT-BR-017` remaining TEMP_WAITING becomes FAILED_DELIVERY | Planned |
| BR-018 | Route activation requires assigned-shipper confirmation | Recommendation status machine and actor guard | API smoke: merchant confirmation returned 403; assigned shipper confirmation succeeded | Pass (API smoke) |
| BR-019 | Confirmed route activates after cancellable five seconds | Persisted countdown deadline | API smoke: deadline was +5s, early activation 409, post-deadline read reconciled IN_PROGRESS; cancel still needed | Pass (activation smoke) |
| BR-020 | Current/completed stops are immutable | Recalculation validator | Backend recalc test preserves current sequence and unique ordered suffix | Pass |
| BR-021 | AI has no direct write access | AI adapter accepts redacted DTO and returns schema-only policy | `UT-BR-021` adapter has no repository and invalid output causes no state diff | Planned |
| BR-022 | Backend validates solver output | Route validation service before persistence/presentation | Backend unit test rejects duplicate output and immutable-prefix injection | Pass |
| BR-023 | No platform max order/stop business rule | No max-count validation; solver only has time bound | `IT-BR-023` fixture above normal demo size is accepted | Planned |

## Functional requirements

### Authentication, applications, and order preparation

| ID | Requirement | Required evidence | Verification | Status |
|---|---|---|---|---|
| FR-001 | Seed Student, Merchant, and Shipper accounts | Seed fixture and README credentials | `E2E-FR-001` each account signs in | Planned |
| FR-002 | One account may have multiple roles | Role array/model and role switch UI | `IT-FR-002` multi-role session authorizes both valid capabilities | Planned |
| FR-003 | Acting identity comes from session | Auth middleware ignores actor IDs in payload | Frontend contract test passes Bearer propagation; API smoke denies unauthorized merchant outcome | Pass (contract smoke) |
| FR-004 | Merchant ownership on all protected data | Central ownership guard | API smoke: foreign merchant trip read returned 403; full matrix remains | Pass (trip smoke) |
| FR-005 | Shipper sees only active-membership merchant trips | Membership-scoped trip query | `IT-FR-005` inactive/wrong merchant trip access denied | Planned |
| FR-006 | Student applies to one merchant | Application endpoint/form | `E2E-FR-006` submit application and see PENDING | Planned |
| FR-007 | Required vehicle, availability, experience; optional note | Request/form schema | `CT-FR-007` missing/invalid fields return field errors | Planned |
| FR-008 | Application status enum | Domain schema/state machine | `UT-FR-008` rejects unknown state/transitions | Planned |
| FR-009 | Merchant approves/rejects pending application | Merchant action endpoints/UI | `E2E-FR-009` both decisions update applicant view | Planned |
| FR-010 | Approval creates active membership | Transactional approval service | Backend test verifies approved membership appears in authenticated student context | Pass |
| FR-011 | Prevent second active membership | Constraint/service guard | Covered by passing backend `BR-002` test | Pass |
| FR-012 | Merchant deactivates membership | Ownership-protected action | `IT-FR-012` deactivation removes shipper capability | Planned |
| FR-013 | Merchant lists only own orders | Scoped query | Covered by `IT-FR-004` | Planned |
| FR-014 | Merchant advances CREATED→CONFIRMED→PREPARING→READY | Order transition service/UI | `IT-FR-014` valid sequence passes; skips/reversals fail | Planned |
| FR-015 | Only READY orders are trip-eligible | Eligibility policy | Covered by passing API smoke for `BR-006` | Pass (smoke) |
| FR-016 | Merchant cannot alter active-trip membership/sequence | Read-only state/actor guards | `IT-FR-016` attempted merchant mutations denied after generation begins | Planned |

### Automatic trip creation and route confirmation

| ID | Requirement | Required evidence | Verification | Status |
|---|---|---|---|---|
| FR-017 | Approved shipper can press Ready to Deliver | Shipper action API/UI | Fastify inject smoke: seeded approved shipper received 201 and recommendation | Pass (API smoke) |
| FR-018 | Atomically select and lock all eligible READY orders | Transactional orchestration | Covered by `IT-BR-006/007` | Planned |
| FR-019 | Group selected orders by building | Trip builder | Covered by passing primary smoke for `BR-004` | Pass (primary smoke) |
| FR-020 | Build authorized operational snapshot | Snapshot mapper with allowlist plus versioned prompt input that explains every operational field | Prompt unit test asserts gate coordinates, orders, legal matrix semantics, and full snapshot transmission | Pass (unit) |
| FR-020A | GPT analyzes operational priority without owning the route | Versioned system prompt limits AI to priorities/weights; OR-Tools remains final route owner | Prompt tests verify retry, waiting, freshness, batching, blocked-road semantics, and AI/solver boundary | Pass (unit) |
| FR-021 | GPT-5.6 returns validated optimization policy | Structured-output schema, timeout, adapter | `UT-FR-021` valid/invalid/timeout responses | Planned |
| FR-022 | OR-Tools returns feasible building route | Solver adapter with bounded time | `IT-FR-022` deterministic fixture returns FEASIBLE | Planned |
| FR-023 | Backend validates route before presentation | Validator gate | Covered by `UT-BR-022` and response-not-published assertion | Planned |
| FR-024 | System creates trip automatically | Trip orchestration service | Fastify inject smoke: action created AWAITING_SHIPPER_CONFIRMATION trip, stops, orders, recommendation | Pass (API smoke) |
| FR-025 | Merchant does not create/confirm trip | No merchant capability; authorization test | `CT-FR-025` merchant action is absent or forbidden | Planned |
| FR-026 | No global max order/stop count | Domain validation review | Covered by `IT-BR-023` | Planned |
| FR-027 | Later READY orders remain for future trip | Trip membership invariant | Covered by passing backend `BR-008` test | Pass |
| FR-028 | Recommendation shows orders, route, duration, AI explanation | Recommendation DTO/UI | `E2E-FR-028` four elements visible | Planned |
| FR-029 | Shipper confirms or rejects recommendation | Assigned-shipper endpoints/UI | `IT-FR-029` both state transitions and wrong actor | Planned |
| FR-030 | Confirmation begins five-second countdown | Persisted STARTING state/deadline | API smoke measured a five-second server deadline | Pass (API smoke) |
| FR-031 | Shipper can cancel countdown | Cancel endpoint/UI | Backend test cancels before expiry and remains AWAITING confirmation after deadline | Pass (API) |
| FR-032 | Countdown completion starts trip/first NEXT stop | Activation service/timer reconciliation | API smoke: post-deadline GET reconciled trip to IN_PROGRESS with a NEXT stop | Pass (API smoke) |

### Stop execution and student tracking

| ID | Requirement | Required evidence | Verification | Status |
|---|---|---|---|---|
| FR-033 | Shipper announces next stop | Assigned-shipper action/event | API smoke: assigned shipper announcement returned 200 | Pass (API smoke) |
| FR-034 | Pre-arrival notice once per affected student | Notification dedupe key | `IT-FR-034` retrying announce creates no duplicate | Planned |
| FR-035 | Shipper marks stop arrival | Transition action/UI | API smoke: NEXT arrival returned 200 | Pass (API smoke) |
| FR-036 | Arrival notice once per affected student | Arrival notification transaction | `IT-FR-036` per-user count and dedupe | Planned |
| FR-037 | Arrival starts two-minute timer | Server timestamp computation | `IT-FR-037` `minimumWaitEndsAt = arrivedAt + 120s` | Planned |
| FR-038 | Delivered enabled immediately | Server rule and UI state | API smoke: DELIVERED immediately after arrival returned 200 | Pass (API smoke) |
| FR-039 | Customer unavailable disabled for two minutes | Server guard and disabled UI | API smoke returned 409 and passing ShipperDashboard test verifies disabled UI from persisted deadline | Pass |
| FR-040 | Expiry unlocks without state transition | Timer-derived capability | Covered by `IT-BR-012` | Planned |
| FR-041 | Shipper may continue waiting | No forced transition/navigation | `E2E-FR-041` expired timer leaves actions and stop ARRIVED | Planned |
| FR-042 | Shipper marks uncollected order TEMP_WAITING | Per-order action | `IT-FR-042` post-deadline transition succeeds | Planned |
| FR-043 | TEMP_WAITING may become DELIVERED while ARRIVED | Late-arrival path | Covered by `IT-BR-013` | Planned |
| FR-044 | Stop completes only with terminal primary outcomes | Completion guard | `IT-FR-044` incomplete order blocks; all outcomes allow completion | Planned |
| FR-045 | Student sees status/current/remaining/route position | Role-specific tracking DTO/UI; GPS visible after trip activation, route clipped and released only after own stop announcement | Backend projection test plus live browser verification before/after announcement | Pass |
| FR-046 | Student sees 2D shipper marker | Student MapLibre view shows only own building and current shipper marker before the route is released | Live browser verified exactly the C3 marker and mock shipper marker before announcement | Pass (browser) |
| FR-047 | Student sees ETA window | ETA projection/UI | `E2E-FR-047` non-guaranteed arrival window displayed | Planned |
| FR-048 | ETA refreshes on location/route changes | Realtime/store derivation | `E2E-FR-048` mock update and route version change refresh ETA | Planned |
| FR-049 | Notices are not duplicated | Unique dedupe key/idempotent insert | `IT-FR-049` repeated action/event yields one notice | Planned |

### Waiting, redelivery, and recalculation

| ID | Requirement | Required evidence | Verification | Status |
|---|---|---|---|---|
| FR-050 | TEMP_WAITING student can press I Am Ready | Student action/UI | `E2E-FR-050` eligible student sees and uses action | Planned |
| FR-051 | I Am Ready changes to TEMP_WAITING_READY | Ownership/state transition service | `IT-FR-051` transition is idempotent and owner-only | Planned |
| FR-052 | Student readiness does not alter primary route | No route mutation in readiness transaction | `IT-FR-052` route version/sequence unchanged | Planned |
| FR-053 | Redelivery starts only after all primary stops complete | Redelivery phase guard | Backend end-to-end retry test completes all primaries before route creation | Pass (API path) |
| FR-054 | Only TEMP_WAITING_READY enters redelivery | Eligibility policy | Backend end-to-end retry test promotes the missed order explicitly before retry | Pass (API path) |
| FR-055 | Redelivery uses GPT analysis and OR-Tools | Recommendation type REDLIVERY pipeline | Backend end-to-end retry test creates a redelivery recommendation through optimizer pipeline | Pass (API path) |
| FR-056 | Shipper confirms redelivery route | Confirmation state/UI | Backend end-to-end retry test confirms the recommendation; UI remains a gap | Pass (API) |
| FR-057 | Redelivery uses cancellable five-second activation | Countdown mechanism reused | Backend retry test exercises activation; dedicated cancel UI evidence remains | Pass (API path) |
| FR-058 | Retry failure locked for two minutes | Retry wait guard/UI | Backend retry path uses server wait state; dedicated pre-deadline retry-failure assertion remains | Pass (path) |
| FR-059 | Retry ends DELIVERED or FAILED_DELIVERY | Retry transition state machine | Backend end-to-end retry test completes FAILED_DELIVERY | Pass (API) |
| FR-060 | Retry cannot re-enter TEMP_WAITING | Transition guard | Backend retry path and state guard cover terminal retry outcomes | Pass (API path) |
| FR-061 | Never-ready waiting order fails at trip close | Completion transaction | Covered by `IT-BR-017` | Planned |
| FR-062 | Only assigned shipper requests recalculation | Actor/assignment guard | `IT-FR-062` other shipper/merchant denied | Planned |
| FR-063 | Recalculation includes remaining unvisited stops only | Fresh snapshot mapper | `UT-FR-063` completed/current are preserved metadata, not reorder candidates | Planned |
| FR-064 | Current/completed stops unchanged | Validator | Covered by passing backend recalc sequence test | Pass |
| FR-065 | Recalc triggers are manual/unavailable/delay only | Trigger policy/UI | `UT-FR-065` enumerated triggers accepted; others ignored | Planned |
| FR-066 | No recalc on each GPS update | Event handler separation | `IT-FR-066` GPS tick creates no recommendation/version | Planned |
| FR-067 | Shipper confirms/rejects revised route | Comparison and action UI/API | `E2E-FR-067` both choices preserve immutable stops | Planned |
| FR-068 | Revised route activates after cancellable five seconds | Persisted route version countdown | Backend recalc activation test preserves prefix; initial cancellation test verifies authority | Pass (API path) |

### Merchant monitoring, mock GPS, and reliability

| ID | Requirement | Required evidence | Verification | Status |
|---|---|---|---|---|
| FR-069 | Merchant trip access becomes read-only after Ready | Authorization/state policy | `IT-FR-069` all merchant writes denied from DRAFT_GENERATING onward | Planned |
| FR-070 | Merchant cannot alter route/stops/shipper/outcomes | No mutation capabilities plus guards | `IT-FR-070` mutation matrix returns forbidden/conflict | Planned |
| FR-071 | Merchant monitors progress/outcomes | Read projection/UI | `E2E-FR-071` merchant sees live read-only state | Planned |
| FR-072 | Deterministic mock waypoint playback | Ready action captures the demo campus-gate coordinate; route activation starts playback automatically | Backend integration test proves `ARMED` before activation and automatic `PLAYING` afterward without a separate GPS-start request | Pass (API) |
| FR-073 | Publish mock location every one second | `MOCK_GPS_INTERVAL_MS=1000`; backend scheduler is authoritative and frontend refreshes every 1000 ms | Backend timer test observes automatic coordinate progress after one second; frontend API contract test covers the start payload | Pass |
| FR-074 | Frontend interpolates marker movement | Transform-based map animation | Marker transition is transform-only; global reduced-motion rule collapses transitions | Pass |
| FR-075 | Current mock point is route origin | Ready payload persists the gate coordinate before recommendation generation; snapshot derives `startLocationId` and shipper coordinates from it | Backend integration test asserts `CAMPUS_DEPOT` and exact latitude/longitude in the AI/solver snapshot | Pass (API) |
| FR-076 | Preserve mock progress across reload | Persisted MockLocationState | Backend test reads persisted waypoint/status through API after tick | Pass (API) |
| FR-077 | Demo reset control | Protected demo-only UI/API/script | Root start/reset/stop rehearsal succeeds; authenticated reset restores seed | Pass (ops rehearsal) |
| FR-078 | State-changing actions are idempotent | Idempotency keys/transition no-op semantics | API smoke replay succeeded once; frontend contract test verifies mutation key; full concurrency matrix remains | Pass (single-action smoke) |
| FR-079 | Actions show loading/success/failure | UI state audit | Frontend error-contract test passes nested backend code/message; full action-state matrix remains | Pass (contract test) |
| FR-080 | Business state persists across reload | Persistent store and hydration | `E2E-FR-080` outcomes/route/countdown survive reload | Planned |
| FR-081 | Complete demo seed exists | Seed/reset fixture | `OPS-FR-081` happy path and exception path available after reset | Planned |
| FR-082 | GPT failure leaves state unchanged and explains fallback | Timeout/schema failure handling | `IT-FR-082` before/after state diff plus user-safe error | Planned |
| FR-083 | Solver failure leaves current route unchanged | Solver failure handling | `IT-FR-083` INFEASIBLE/TIME_LIMIT/invalid output state diff | Planned |
| FR-084 | Deterministic baseline route may cover AI outage | Optional fallback adapter and disclosure | Fastify inject smoke with no API key and unreachable worker returned AI/solver source `FALLBACK` | Pass (API smoke) |

## Acceptance scenarios

| ID | Journey | End-to-end proof | Supporting rules | Status |
|---|---|---|---|---|
| AS-001 | Approve student shipper | Pending application → approval → access; second membership conflict | BR-002/003; FR-006–011 | Planned |
| AS-002 | Prepare orders | Merchant advances selected orders; only READY subset eligible | BR-006; FR-013–015 | Planned |
| AS-003 | Automatically create trip | Approved shipper creates locked, building-grouped, validated recommendation | BR-003/004/007/021/022; FR-017–024 | Planned |
| AS-004 | Exclude later-ready order | New READY order stays outside active trip | BR-008; FR-027 | Planned |
| AS-005 | Confirm initial route | Confirm → cancellable five-second countdown → start | BR-018/019; FR-028–032 | Planned |
| AS-006 | Enforce two-minute lock | At C3, Deliver works and unavailable is disabled before deadline | BR-011; FR-035–039 | Planned |
| AS-007 | Mark temporary waiting | Expiry unlocks; only shipper action changes state | BR-012; FR-040–042 | Planned |
| AS-008 | Student arrives before completion | TEMP_WAITING → DELIVERED while stop ARRIVED | BR-013; FR-043 | Planned |
| AS-009 | Student ready after departure | TEMP_WAITING → TEMP_WAITING_READY with unchanged primary route | BR-014; FR-050–052 | Planned |
| AS-010 | Generate redelivery route | Completed primaries → grouped AI/solver route → shipper confirmation | BR-016/018; FR-053–057 | Planned |
| AS-011 | Fail never-ready student | Remaining TEMP_WAITING → FAILED_DELIVERY at close | BR-017; FR-061 | Planned |
| AS-012 | Enforce one retry | Failed retry is terminal and cannot queue again | BR-015; FR-058–060 | Planned |
| AS-013 | Recalculate remaining route | Fresh policy/solver result compares routes, preserving immutable stops | BR-020/022; FR-062–068 | Planned |
| AS-014 | Temporarily unavailable stop | Remaining stop moves later but stays in trip | BR-020; FR-063–065 | Planned |
| AS-015 | Merchant cannot intervene | Merchant mutation denied while monitoring remains available | BR-001; FR-069–071 | Planned |
| AS-016 | Mock GPS movement | One-second automatic updates move the marker, wait at each current stop, and resume after stop completion | FR-072–076 | Pass (API path) |
| AS-017 | AI failure | Invalid/timeout output never applies; clear failure/fallback | BR-021/022; FR-082/084 | Planned |
| AS-018 | Solver validation | Missing/duplicate stop recommendation rejected without route change | BR-022; FR-083 | Planned |

## Non-functional requirements

| ID | Requirement | Required evidence | Release threshold | Status |
|---|---|---|---|---|
| NFR-001 | Responsive student/shipper flows | `VIS-NFR-001` at mobile and desktop widths | Browser inspection at 390px and 1440px found the critical live flow usable | Pass (browser inspection) |
| NFR-002 | Idempotency | `IT-FR-078` mutation replay suite | No duplicate notice, outcome, route version, membership, or audit effect | Planned |
| NFR-003 | Persistence | `E2E-FR-080` hard-reload suite | Completed outcomes, active route, countdown target, and GPS progress retained | Planned |
| NFR-004 | GPT timeout/failure state | `UT-FR-021`, `IT-FR-082` | Bounded request; controlled error/fallback; no partial state | Planned |
| NFR-005 | Bounded OR-Tools solve | `IT-FR-022/083` plus configuration evidence | Solve time configured; TIME_LIMIT handled without corruption | Planned |
| NFR-006 | AI-input privacy | `UT-FR-020` snapshot allowlist | No password, payment, phone/email/name, or foreign-merchant order | Planned |
| NFR-007 | Auditability | `IT-NFR-007` event catalogue assertion | All 20 specified business events recorded with actor/merchant/trip context | Planned |
| NFR-008 | Demo reset | `OPS-FR-077/081` | Root authenticated reset script succeeded against running local API | Pass |
| NFR-009 | Complete local execution | `OPS-NFR-009` clean-machine README rehearsal | Root scripts started solver/API/web (health ok/ok/200), reset seed, and stopped process trees | Pass (prepared machine) |

## UI/design-system review gate

This gate applies the requested `design-system` and `design-taste-frontend` skills without overriding product correctness.

- Dependency and Tailwind versions are verified before imports or syntax choices.
- One neutral palette plus at most one restrained accent; no purple/blue AI gradient, neon glow, pure black, emoji, Inter, generic names, or Unsplash.
- Typography, spacing, radii, borders, shadows, icon family, and icon stroke weight are tokenized and consistent.
- High-variance desktop layouts collapse to one column below `md`; full-height views use `min-h-[100dvh]`, not `h-screen`.
- Forms use labels above fields with inline error text; focus-visible styles, contrast, keyboard operation, and touch targets are verified.
- Loading uses layout-matched skeletons; empty, error, success, disabled, hover, focus, and tactile active states exist where applicable.
- Animation is limited to transform/opacity, cleans up effects, respects reduced motion, and does not trigger route recalculation on GPS ticks.
- Containers/cards communicate hierarchy rather than wrapping every block; dashboard information remains legible at mobile widths.

## Historical integration gap log (superseded)

These observations were captured while implementation was being produced in parallel. They are retained as review history and are superseded by the final status table below.

| Severity | Gap | Affected IDs | Owner/status |
|---|---|---|---|
| Release blocker | Frontend currently does not send the Bearer token required by backend authentication and silently falls back to local state after API failure | FR-003–005, FR-078–080; most AS | Frontend notified; awaiting fix |
| Release blocker | Frontend and backend seed identifiers/personas differ, preventing a live seeded sign-in and DTO reconciliation | FR-001/002/081, AS-001–003 | Frontend notified; awaiting alignment |
| Release blocker | Frontend request paths/bodies/envelopes and missing idempotency headers do not match the implemented API routes | FR-003, FR-006–079; most AS | Frontend notified with backend route mapping |
| Evidence gap | Trip selection/claim now uses `BEGIN IMMEDIATE` plus claim-count verification, but has no passing concurrency test yet | BR-007, FR-018, AS-003, NFR-002 | Backend fix observed; test pending |
| Release blocker | ARRIVED stop is excluded from solver candidates, but recalculation activation renumbers remaining stops from 1 and can place them before/duplicate the immutable prefix | BR-020, FR-063/064, AS-013 | Backend notified; offset/test pending |
| Major | Solver objective does not yet demonstrate that all specified policy weights/terms affect route cost | G-003/004, FR-021/022/055, spec §12.4 | Backend notified; awaiting test/fix |
| Evidence gap | Countdown reconciliation/tick code exists, but server timer wiring and reload tests are not yet present | BR-019, FR-030–032/057/068, SC-014 | Backend fix observed; integration test pending |
| Evidence gap | Mock GPS playback actions and five-second tick code exist, but server timer wiring/API tests are not yet present | FR-072–077, AS-016, SC-012 | Backend fix observed; integration test pending |
| Release blocker | Frontend has no integrated redelivery planning/confirmation/countdown/retry path and currently completes after the primary route | FR-053–061, AS-010–012 | Frontend notified; awaiting implementation |
| Release blocker | Frontend countdown and arrival deadlines are local-only, so reload loses timers; recalculation comparison is hardcoded and confirms the wrong recommendation | FR-067/068/080, AS-013, SC-014 | Frontend notified; awaiting live DTO integration |
| Release blocker | Membership approval check/insert and idempotency lookup/run/record are not concurrency-safe transactions | BR-002, FR-010/011/078, NFR-002 | Backend notified; awaiting fix/tests |
| Evidence gap | Initial route rejection now returns orders to READY and cancels pre-start trip; behavior needs integration test | FR-029, trip failure lifecycle | Backend fix observed; test pending |
| Major | Frontend expects top-level error fields while backend returns the standard nested `error` envelope | FR-079; API design gate | Frontend notified; awaiting fix |
| Major | Approved-shipper deactivation is displayed but not wired to an action | FR-012 | Frontend notified; awaiting fix |
| Major | Five-second dashboard polling cannot guarantee the three-second local update target | SC-013, FR-045–049/071 | Frontend notified; awaiting realtime/faster refresh evidence |
| Design/performance | Campus marker transitions layout properties (`left`/`top`) and lacks reduced-motion evidence | FR-074, NFR-001; frontend skill gate | Frontend notified; awaiting fix |
| Evidence gap | Python test collection cannot run because OR-Tools is not installed | FR-022/083, NFR-005/009 | Install worker requirements, then rerun worker suite |
| Evidence gap | Backend TypeScript build passes, but `npm --prefix backend test` fails because there are no test files | Backend BR/FR/NFR evidence | Reproduced locally; backend notified to add critical tests |
| Evidence gap | Frontend production build passes and 4 focused tests pass; broader role journeys and responsive browser tests remain | Frontend DoD; remaining UI FRs/NFR-001 | `api`, SignIn, and persisted wait-lock tests pass |
| Evidence gap | No integrated passing evidence recorded yet | Remaining rows | Awaiting backend/frontend integration |

## Final review status

| Severity | Current finding | Affected IDs | Evidence/status |
|---|---|---|---|
| Pass | Backend TypeScript build succeeds and all 27 Vitest cases pass | Backend BR/FR/NFR coverage plus multi-order/cross-merchant placement, complete campus layout, segment, matrix, geometry, operator-confirmed restricted polygons, playback guard, route-progress, GPS-origin, ETA, and redelivery tests | Final verification: `npm --prefix backend run build` and `npm --prefix backend test` |
| Pass | OR-Tools worker uses typed Pydantic input, implements all five objective terms, and passes its health/inclusion test | FR-021–023/055/083, NFR-005 | `python -m pytest solver-worker/test_app.py -q`: 1 passed; only SWIG deprecation warnings |
| Pass | Frontend production build succeeds and all 9 Vitest files / 24 tests pass | EXT-013; FR-003/039/045–048/074/078/079, multi-order request contract, student tracking stages, route-layer phases, live ETA, public landing, role routing, sign-in/shipper/API request contracts, and monotonic route progress | Final build and test evidence |
| Pass | Root README workflow starts all three services, reports solver/API/web health, performs authenticated reset, and stops recorded process trees | FR-077, NFR-008/009, SC-017 | Rehearsed locally with `Start-Demo.ps1`, `Reset-Demo.ps1`, and `Stop-Demo.ps1` |
| Pass | Atomic Ready claim, later-ready exclusion, membership uniqueness, route validation, countdown reconciliation/cancel, route-prefix immutability, wait lock, one redelivery, and GPS tick have passing backend tests | BR-002/004/006/007/008/011/018–020/022; core AS | Backend `tests/api.test.ts` |
| Pass | Live API smoke verifies foreign merchant 403, own student access, merchant confirmation denial, exact five-second deadline, early activation denial, post-deadline activation, immediate Delivered, locked TEMP_WAITING, and idempotent replay | FR-004/030/032/033/035/038/039/078 | Fastify inject against the isolated local PostgreSQL test database |
| Pass | Live browser flow used the real OR-Tools worker: 3 eligible READY orders became 2 building stops, solver source was not fallback, route was confirmed, countdown reached IN_PROGRESS, then announce/arrive exposed Delivered while unavailable remained locked at 112s | AS-003/005/006/016; FR-017–024/028–040 | Browser E2E on the integrated local stack |
| Pass | Mobile 390px and desktop 1440px layouts were visually inspected | NFR-001, SC-001/013/017, UI DoD | Critical controls and live route remained usable at both widths |
| Evidence gap | Worker test proves schema/health/every-stop inclusion, but does not vary each objective weight to prove order sensitivity | G-003/004, spec §12.4 | Recommended additional solver fixtures; implementation includes all terms |
| Evidence gap | Initial route rejection cleanup and same-key concurrent idempotency reservation are implemented but lack dedicated assertions | FR-029/078, NFR-002 | Recommended focused backend tests |
| Evidence gap | The frontend provides the redelivery/recalculation path, but current focused tests do not cover those complete browser journeys | FR-053–061/067/068, AS-010–013 | Backend journey passes; add frontend integration/E2E coverage |
