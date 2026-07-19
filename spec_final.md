# Feature Specification: AI-Orchestrated Dormitory Batch Delivery MVP

**Feature Branch**: `001-ai-batch-delivery-mvp`  
**Created**: 2026-07-19  
**Status**: Final Draft — ready for `/speckit.plan`  
**Target**: OpenAI Build Week four-day hackathon MVP  
**Primary Track**: Apps for Your Life  
**Primary Platform**: Responsive web application  
**Input**: Rebuild the current dormitory batch-delivery specification using the latest confirmed product decisions.

---

## 1. Product Summary

The product is a food-delivery coordination platform for merchants serving students inside a university dormitory campus.

Delivery is organized by dormitory building rather than by room or individual address. Orders assigned to the same building are grouped into one delivery stop. Students collect food at a fixed pickup point outside their building.

Each merchant maintains its own student-shipper pool. A student may apply to become a shipper for one merchant. After approval, the student can start delivery work for that merchant.

A delivery trip is not manually created or confirmed by the merchant. When an approved shipper arrives at the dormitory area and presses **Ready to Deliver**, the system:

1. Takes all eligible `READY` orders for that merchant.
2. Locks those orders into a new trip.
3. Builds a live operational snapshot.
4. Uses GPT-5.6 to evaluate delivery priorities and constraints.
5. Uses OR-Tools to calculate a valid building sequence.
6. Shows the recommended route to the shipper.
7. Starts the trip after shipper confirmation and a five-second countdown.

The merchant may monitor the trip but may not alter the active delivery process.

For hackathon reliability, shipper location is provided by deterministic mock GPS data rather than real device GPS.

---

## 2. Problem Statement

Dormitory food delivery has operational constraints that conventional street delivery systems do not handle well:

- Many customers share the same building and pickup point.
- Shippers waste time contacting students individually.
- One student arriving late may delay all remaining deliveries.
- The shortest route is not always the best route because order age and food freshness matter.
- Merchants need a simple way to recruit student shippers.
- Students need visibility into where the shipper is and when their building will be served.
- Missed orders need one controlled retry without forcing the shipper to immediately turn back.

The MVP must coordinate these constraints in one coherent, runnable delivery flow.

---

## 3. Product Goals

### G-001 — Batch delivery by building

Group orders by dormitory building so one stop can serve multiple students.

### G-002 — Prevent one late customer from blocking the route

Require a minimum waiting period, then allow the shipper to move an uncollected order into a temporary waiting queue.

### G-003 — Use AI for real operational reasoning

Use GPT-5.6 to evaluate order state, food sensitivity, waiting time, building density, and current shipper position.

### G-004 — Use a deterministic solver for route calculation

Use OR-Tools to produce a route that respects hard constraints and GPT-5.6 priorities.

### G-005 — Preserve human control

Require shipper confirmation before an initial or revised route becomes active.

### G-006 — Support student shipper recruitment

Allow a student to apply to one merchant and allow that merchant to approve or reject the application.

### G-007 — Deliver a stable hackathon demo

Use seeded accounts, seeded orders, deterministic mock GPS, and reproducible route scenarios.

---

## 4. Scope Classification

| Feature | Classification | Demo Rationale |
|---|---|---|
| Seeded Student, Merchant, and Shipper access | Must Have | Enables the full demo without external identity providers. |
| Student shipper application and merchant approval | Must Have | Demonstrates the merchant-owned student shipper model. |
| Merchant order preparation lifecycle | Must Have | Provides real order-state input for AI route analysis. |
| Shipper-triggered automatic trip creation | Must Have | Replaces manual merchant trip construction. |
| Building-level batching | Must Have | Core value of dormitory delivery. |
| GPT-5.6 operational priority analysis | Must Have | Core OpenAI feature. |
| OR-Tools route calculation | Must Have | Makes route generation valid and testable. |
| Shipper route confirmation and five-second activation countdown | Must Have | Preserves human control. |
| Mock GPS playback on a 2D campus map | Must Have | Provides stable location-aware demo behavior. |
| Stop arrival and two-minute minimum wait | Must Have | Prevents premature unavailable decisions. |
| Manual `TEMP_WAITING` decision after two minutes | Must Have | Keeps the shipper in control. |
| End-of-primary-route redelivery | Must Have | Provides one controlled retry. |
| Exception-driven remaining-route recalculation | Must Have | Demonstrates adaptive AI without route instability. |
| AI shipper-application summary | Stretch | Helpful but not required for the core journey. |
| Real device GPS | Out of Scope for MVP | Mock GPS is used for demo reliability. |
| Payments, vouchers, chat, ratings, push notifications, street maps, native apps, multi-campus, payroll, identity-document upload | Out of Scope | These do not prove the core delivery orchestration flow. |

---

## 5. Confirmed Product Decisions

### PD-001 — Student shipper application is required

A student may apply to one merchant using basic operational information.

### PD-002 — AI shipper screening is optional

GPT-5.6 may summarize an application, but the merchant always makes the decision.

### PD-003 — Shipper decides that a student is unavailable

The system does not automatically move an order to `TEMP_WAITING` when the timer expires.

### PD-004 — The unavailable button is locked for two minutes

After the shipper arrives, **Delivered** is immediately available, but **Customer unavailable** remains disabled for two minutes.

### PD-005 — Mock GPS is used in the MVP

The demo uses repeatable location waypoints and timed movement updates.

### PD-006 — The system creates the trip

The merchant does not manually create or confirm the delivery trip.

### PD-007 — The shipper starts trip generation

An approved shipper presses **Ready to Deliver** to trigger trip creation and route generation.

### PD-008 — Merchant is read-only during active delivery

The merchant may monitor but may not change route, shipper, stop, or delivery outcomes.

### PD-009 — Primary orders are locked at trip creation

Orders that become `READY` after trip creation are reserved for a future trip.

### PD-010 — Redelivery occurs only after the primary route

No immediate retry, no merge into an upcoming primary stop, and no 15-minute retry target.

### PD-011 — One retry maximum

An order may receive one primary attempt and one redelivery attempt.

### PD-012 — GPT-5.6 analyzes; OR-Tools calculates

GPT-5.6 produces priorities, constraints, and explanation. OR-Tools produces the ordered building route.

### PD-013 — Shipper confirms each route

The shipper confirms the initial route and any revised route.

### PD-014 — Confirmed routes activate after five seconds

After confirmation, the system begins a five-second countdown. The shipper may cancel during the countdown.

### PD-015 — No maximum order or stop count

The platform does not enforce a global `maxOrders` or `maxStops` business rule.

### PD-016 — Current and completed stops are immutable

Only unvisited remaining stops may be reordered.

### PD-017 — Consistent waiting states

The MVP uses:

```text
TEMP_WAITING
TEMP_WAITING_READY
REDELIVERY_NEXT
FAILED_DELIVERY
```

---

## 6. User Roles

## 6.1 Student

A student may:

- Sign in using a seeded account.
- Select or view their dormitory building.
- View merchants and products.
- Place or view a seeded order.
- View order preparation and delivery status.
- View the shipper on a 2D campus map.
- View the current building, remaining building sequence, and estimated arrival window.
- Receive in-app trip, pre-arrival, and arrival notices.
- Mark a waiting order as ready for redelivery.
- Apply to become a shipper for one merchant.
- View application status.

## 6.2 Merchant

A merchant may:

- Sign in using a seeded account.
- View only its own orders.
- Advance orders through the restaurant preparation lifecycle.
- View pending student shipper applications.
- Approve or reject applications.
- Deactivate an approved shipper membership.
- View the generated trip and live progress.
- View AI route reasoning and delivery outcomes.
- View temporary waiting and failed orders.

A merchant may not, after the shipper presses **Ready to Deliver**:

- Modify the active trip.
- Add or remove active-trip orders.
- Change the route.
- Replace the shipper.
- Mark orders delivered.
- Confirm a route recommendation.
- Cancel the active trip.

## 6.3 Shipper

An approved shipper may:

- Press **Ready to Deliver**.
- Trigger automatic trip and route generation.
- Review and confirm the initial route.
- Start the trip after the five-second countdown.
- View mock GPS movement and ordered stops.
- Announce the next building.
- Mark arrival at a stop.
- Mark orders delivered.
- After two minutes, mark uncollected orders `TEMP_WAITING`.
- Complete a stop after every order has an outcome.
- Request recalculation of remaining stops.
- Mark a stop temporarily unavailable.
- Confirm or reject a revised route.
- Execute the redelivery route.
- Complete the trip.

---

## 7. Core Business Rules

### BR-001 — Merchant ownership

Every order, product, trip, stop, application, and approved shipper membership belongs to one merchant.

### BR-002 — One active merchant membership

A student may have only one active `MerchantShipper` membership at a time.

### BR-003 — Approved shipper requirement

Only an approved active shipper may trigger trip creation for a merchant.

### BR-004 — One building per stop

All orders assigned to the same building in one delivery pass must belong to one stop.

### BR-005 — Fixed pickup point

Each building has one fixed pickup point. Room-level delivery is unsupported.

### BR-006 — Trip order eligibility

When the shipper presses **Ready to Deliver**, eligible orders are those that:

- Belong to the shipper's merchant.
- Have status `READY`.
- Are not assigned to another trip.
- Are not cancelled.
- Are not delivered.

### BR-007 — Trip locking

All eligible orders are atomically locked and assigned to the generated trip.

### BR-008 — New ready orders use the next trip

An order becoming `READY` after trip creation cannot enter the active trip.

### BR-009 — Group notifications

Students at the same upcoming building receive a shared pre-arrival notice.

### BR-010 — Individual outcomes

Every order must receive its own delivery outcome.

### BR-011 — Minimum wait

The shipper must wait at least two minutes after stop arrival before marking an uncollected order unavailable.

### BR-012 — No automatic waiting transition

Timer expiry only unlocks the unavailable action. It does not change order state.

### BR-013 — Late student before stop completion

If an order has been marked `TEMP_WAITING` but the stop is still `ARRIVED`, the shipper may still mark it `DELIVERED`.

### BR-014 — Late student after stop completion

After the stop is completed, a waiting order may be served only in redelivery.

### BR-015 — One retry

An order may enter redelivery only once during the same trip.

### BR-016 — Redelivery eligibility

Only `TEMP_WAITING_READY` orders enter the redelivery route.

### BR-017 — Waiting but not ready

Orders still in `TEMP_WAITING` when the redelivery phase ends become `FAILED_DELIVERY`.

### BR-018 — Human-confirmed route activation

A route cannot become active without shipper confirmation.

### BR-019 — Five-second countdown

A confirmed route activates after five seconds unless the shipper cancels the countdown.

### BR-020 — Route immutability

Completed stops and the current `ARRIVED` stop cannot be reordered or removed.

### BR-021 — AI has no direct write access

GPT-5.6 cannot directly change database state.

### BR-022 — Solver result validation

The backend validates all solver output before showing or applying it.

### BR-023 — No global maximum

There is no platform-level maximum number of orders or buildings in one trip.

---

## 8. Order Lifecycle

### 8.1 Restaurant lifecycle

```text
CREATED
→ CONFIRMED
→ PREPARING
→ READY
```

### 8.2 Primary delivery success

```text
READY
→ ASSIGNED_TO_TRIP
→ NOTIFIED_TO_COME_DOWN
→ DELIVERED
```

### 8.3 Primary delivery missed, then redelivered

```text
NOTIFIED_TO_COME_DOWN
→ TEMP_WAITING
→ TEMP_WAITING_READY
→ REDELIVERY_NEXT
→ DELIVERED
```

### 8.4 Primary delivery missed, retry failed

```text
NOTIFIED_TO_COME_DOWN
→ TEMP_WAITING
→ TEMP_WAITING_READY
→ REDELIVERY_NEXT
→ FAILED_DELIVERY
```

### 8.5 Student never becomes ready

```text
NOTIFIED_TO_COME_DOWN
→ TEMP_WAITING
→ FAILED_DELIVERY
```

### 8.6 Cancellation

An order may be cancelled only before assignment to an active trip.

---

## 9. Trip Lifecycle

```text
DRAFT_GENERATING
→ AWAITING_SHIPPER_CONFIRMATION
→ STARTING
→ IN_PROGRESS
→ REDELIVERY
→ COMPLETED
```

Failure states:

```text
GENERATION_FAILED
CANCELLED_BEFORE_START
```

Rules:

- `DRAFT_GENERATING` exists while snapshot, GPT-5.6 analysis, and solver execution run.
- `AWAITING_SHIPPER_CONFIRMATION` shows the recommended route.
- `STARTING` represents the five-second countdown.
- The shipper may cancel only before `IN_PROGRESS`.
- The merchant cannot cancel or modify the trip.

---

## 10. Stop Lifecycle

### 10.1 Primary stop

```text
WAITING
→ NEXT
→ ARRIVED
→ COMPLETED
```

### 10.2 Redelivery stop

```text
RETRY_WAITING
→ RETRY_NEXT
→ RETRY_ARRIVED
→ RETRY_COMPLETED
```

### 10.3 Temporarily unavailable stop

A remaining primary stop may be marked temporarily unavailable before arrival.

The stop remains in the trip and may be moved later in the remaining route.

---

## 11. Primary User Journeys

## 11.1 Student applies as a shipper

```text
Student opens merchant page
→ Selects Apply as Shipper
→ Enters vehicle type, availability, experience, and note
→ Application becomes PENDING
→ Merchant approves or rejects
→ Approval creates active MerchantShipper membership
→ Student gains SHIPPER access for that merchant
```

## 11.2 Merchant prepares orders

```text
Merchant confirms incoming order
→ Marks order PREPARING
→ Marks order READY when food is complete
→ READY order becomes eligible for the next shipper-triggered trip
```

## 11.3 Shipper generates the trip

```text
Approved shipper arrives at dormitory area
→ Opens Shipper dashboard
→ Mock GPS provides current position
→ Presses Ready to Deliver
→ Backend selects all eligible READY orders
→ Backend locks selected orders
→ Backend builds OperationalSnapshot
→ GPT-5.6 creates OptimizationPolicy
→ OR-Tools calculates primary route
→ Backend validates route
→ System creates trip and stops
→ Shipper reviews recommendation
```

If no eligible order exists:

```text
No trip is created
→ Show “No ready orders available”
```

## 11.4 Shipper confirms and starts

```text
Shipper reviews:
- included orders
- building sequence
- estimated duration
- AI explanation

→ Presses Confirm Route
→ Five-second countdown begins
→ Shipper may cancel countdown
→ Countdown completes
→ Trip becomes IN_PROGRESS
→ First stop becomes NEXT
→ Students receive trip-start notice
```

## 11.5 Deliver at one building

```text
Stop becomes NEXT
→ Students at building receive pre-arrival notice
→ Shipper reaches building
→ Presses Arrived
→ Students receive arrival notice
→ Two-minute timer begins
→ Delivered action is immediately enabled
→ Customer unavailable remains locked
```

During the two-minute period:

```text
Student collects order
→ Shipper marks DELIVERED
```

After two minutes:

```text
Customer unavailable action unlocks
→ Shipper may continue waiting
or
→ Shipper marks TEMP_WAITING
```

The stop may complete only when every order is:

```text
DELIVERED
or
TEMP_WAITING
```

## 11.6 Student becomes ready later

```text
Order is TEMP_WAITING
→ Student presses I Am Ready
→ Order becomes TEMP_WAITING_READY
→ Primary route does not change
→ Order waits for end-of-route redelivery
```

## 11.7 Redelivery

```text
All primary stops complete
→ Backend collects TEMP_WAITING_READY orders
→ Group orders by building
→ Build redelivery OperationalSnapshot
→ GPT-5.6 evaluates retry priorities
→ OR-Tools calculates redelivery route
→ Backend validates route
→ Shipper confirms route
→ Five-second countdown
→ Trip becomes REDELIVERY
```

At a retry stop:

```text
Shipper presses Retry Arrived
→ Two-minute timer begins
→ Delivered is immediately enabled
→ Failed delivery action unlocks after two minutes
```

Results:

```text
DELIVERED
or
FAILED_DELIVERY
```

No order may re-enter `TEMP_WAITING` after retry.

## 11.8 Trip completion

After all retry stops:

- `TEMP_WAITING` orders that never became ready become `FAILED_DELIVERY`.
- All retry stops become terminal.
- The trip becomes `COMPLETED`.

---

## 12. Route Generation and AI Specification

## 12.1 Operational Snapshot

The backend must build a controlled snapshot from authorized current state.

```ts
type OperationalSnapshot = {
  generatedAt: string;
  merchantId: string;
  shipper: {
    shipperId: string;
    currentLatitude: number;
    currentLongitude: number;
    locationTimestamp: string;
  };
  orders: Array<{
    orderId: string;
    buildingId: string;
    status:
      | "READY"
      | "TEMP_WAITING_READY"
      | "REDELIVERY_NEXT";
    readyAt: string | null;
    minutesWaiting: number;
    foodCategory: string;
    freshnessRisk: "LOW" | "MEDIUM" | "HIGH";
    deliveryAttempt: 1 | 2;
  }>;
  buildings: Array<{
    buildingId: string;
    pickupLatitude: number;
    pickupLongitude: number;
    mapXRatio: number;
    mapYRatio: number;
  }>;
  remainingStops: Array<{
    stopId: string;
    buildingId: string;
    status: string;
    sequence: number;
  }>;
  completedStopIds: string[];
  currentStopId: string | null;
  travelTimeMatrix: Record<string, Record<string, number>>;
};
```

The snapshot must exclude:

- Passwords.
- Payment data.
- Unnecessary student identity details.
- Orders belonging to another merchant.

## 12.2 GPT-5.6 responsibilities

GPT-5.6 evaluates:

1. How long each order has been `READY`.
2. Food freshness risk.
3. Number of orders grouped at each building.
4. Shipper's current mock GPS position.
5. Remaining travel time between buildings.
6. Whether a stop is temporarily unavailable.
7. Whether a current route delay changes urgency.
8. Redelivery customer readiness.
9. Whether a route change is significant enough to recommend.

GPT-5.6 returns structured analysis, not the final route.

```ts
type OptimizationPolicy = {
  buildingPriorities: Array<{
    buildingId: string;
    priorityScore: number;
    reasons: string[];
  }>;
  objectiveWeights: {
    travelTime: number;
    orderWaiting: number;
    freshnessRisk: number;
    buildingBatchValue: number;
    routeChangePenalty: number;
  };
  hardConstraints: {
    preserveCurrentStop: true;
    preserveCompletedStops: true;
    includeEveryEligibleOrder: true;
    excludeUnavailableBuildingIds: string[];
  };
  explanation: string[];
  recommendationNeeded: boolean;
};
```

## 12.3 OR-Tools responsibilities

OR-Tools receives the validated snapshot and policy.

It must:

- Include every eligible stop exactly once.
- Preserve completed stops.
- Preserve the current arrived stop.
- Use the shipper's latest mock GPS point as the route origin.
- Respect temporarily unavailable buildings.
- Minimize the weighted objective.
- Return a feasible route within a bounded solve time.

```ts
type SolverResult = {
  status: "FEASIBLE" | "INFEASIBLE" | "TIME_LIMIT";
  orderedStopIds: string[];
  orderedBuildingIds: string[];
  estimatedTravelMinutes: number;
  estimatedServiceMinutes: number;
  objectiveScore: number;
};
```

## 12.4 Objective model

The route is evaluated using:

```text
Total Cost =
    travel-time cost
  + order-waiting cost
  + freshness-risk cost
  - building-batch value
  + route-change penalty
```

The UI must call the result:

```text
Recommended Route
```

It must not claim guaranteed global optimality.

## 12.5 Backend validation

Before a route is shown or applied, the backend must verify:

- All stop IDs belong to the same trip.
- Every eligible remaining stop appears exactly once.
- No stop is duplicated.
- No stop is added from another trip.
- Current and completed stops are unchanged.
- Every included order belongs to the shipper's merchant.
- Every included order has an eligible status.
- Snapshot and mock GPS timestamps are valid.
- Solver result status is acceptable.

Invalid output leaves the current route unchanged.

---

## 13. Route Recalculation

The system must not recalculate on every mock GPS update.

A recalculation may be proposed when:

1. The shipper manually presses **Recalculate Remaining Route**.
2. A remaining stop is marked temporarily unavailable.
3. A stop exceeds the configured delay threshold.

### 13.1 Delay trigger

When a stop remains `ARRIVED` beyond the delay threshold, the UI may show:

```text
Route may be improved
```

The shipper must still press **Recalculate**.

### 13.2 Recalculation flow

```text
Trigger occurs
→ Backend builds fresh snapshot
→ GPT-5.6 evaluates whether recommendation is useful
→ OR-Tools calculates remaining route
→ Backend validates
→ UI compares current and recommended route
→ Shipper confirms or keeps current route
```

### 13.3 Route comparison

The shipper sees:

```text
Current route:
C3 → D2 → F1

Recommended route:
D2 → C3 → F1

Estimated impact:
- High-risk drink orders delivered earlier
- 3 minutes additional travel
- 7 minutes reduced freshness delay

[Confirm New Route]
[Keep Current Route]
```

### 13.4 Activation

```text
Confirm New Route
→ Five-second countdown
→ Cancel is available
→ New route activates
```

---

## 14. Mock GPS Specification

## 14.1 Purpose

Mock GPS is required for deterministic hackathon behavior.

## 14.2 Data source

The system stores a sequence of waypoints for each demo route.

```ts
type MockGpsWaypoint = {
  latitude: number;
  longitude: number;
  mapXRatio: number;
  mapYRatio: number;
  offsetSeconds: number;
};
```

## 14.3 Playback

- Publish one location update every five seconds.
- Interpolate between waypoints on the frontend.
- Update the 2D map marker.
- Update ETA when location changes.
- Stop playback when the trip completes.
- Resume from persisted route progress after page reload.

## 14.4 Route origin

Initial route generation uses the current mock GPS point when the shipper presses **Ready to Deliver**.

Recalculation uses the most recent mock GPS point.

## 14.5 Demo controls

The shipper demo interface may include:

```text
Start Mock Movement
Pause
Resume
Advance to Next Stop
Reset Demo
```

These controls are visible only in demo mode.

## 14.6 Real GPS

Real browser/device GPS is outside the Must Have MVP and may be added later without changing domain rules.

---

## 15. Functional Requirements

## 15.1 Authentication and authorization

- **FR-001**: The system MUST provide seeded Student, Merchant, and Shipper accounts.
- **FR-002**: The system MUST support multiple roles on one account.
- **FR-003**: The system MUST derive acting identity from the authenticated session.
- **FR-004**: The system MUST enforce merchant ownership on all protected data.
- **FR-005**: A shipper MUST access only trips belonging to their active merchant membership.

## 15.2 Student shipper application

- **FR-006**: A student MUST be able to apply to one merchant.
- **FR-007**: An application MUST include vehicle type, availability, experience, and optional note.
- **FR-008**: Application status MUST be `PENDING`, `APPROVED`, `REJECTED`, or `CANCELLED`.
- **FR-009**: A merchant MUST be able to approve or reject a pending application.
- **FR-010**: Approval MUST create an active merchant-shipper membership.
- **FR-011**: The system MUST prevent a second active merchant membership.
- **FR-012**: A merchant MUST be able to deactivate a membership.

## 15.3 Merchant order preparation

- **FR-013**: A merchant MUST see only its own orders.
- **FR-014**: A merchant MUST advance orders through `CREATED`, `CONFIRMED`, `PREPARING`, and `READY`.
- **FR-015**: Only `READY` orders MUST be eligible for automatic trip creation.
- **FR-016**: After trip creation, merchant operations MUST NOT modify active-trip order membership or delivery sequence.

## 15.4 Automatic trip creation

- **FR-017**: An approved shipper MUST be able to press **Ready to Deliver**.
- **FR-018**: The system MUST atomically select and lock all eligible `READY` orders for the shipper's merchant.
- **FR-019**: The system MUST group selected orders by building.
- **FR-020**: The system MUST build an authorized operational snapshot.
- **FR-021**: GPT-5.6 MUST return a validated optimization policy.
- **FR-022**: OR-Tools MUST return a feasible building route.
- **FR-023**: The backend MUST validate the route before presenting it.
- **FR-024**: The system MUST create the trip automatically.
- **FR-025**: The merchant MUST NOT be required to create or confirm the trip.
- **FR-026**: The platform MUST NOT enforce a global maximum order or stop count.
- **FR-027**: Orders becoming `READY` after trip creation MUST remain available for a future trip.

## 15.5 Route confirmation and start

- **FR-028**: The shipper MUST see included orders, building route, estimated duration, and AI explanation.
- **FR-029**: The shipper MUST confirm or reject the recommendation.
- **FR-030**: Confirmation MUST begin a five-second countdown.
- **FR-031**: The shipper MUST be able to cancel during the countdown.
- **FR-032**: Countdown completion MUST start the trip and activate the first stop.

## 15.6 Stop execution

- **FR-033**: The shipper MUST announce the next stop.
- **FR-034**: The system MUST send one pre-arrival notice per affected student.
- **FR-035**: The shipper MUST mark stop arrival.
- **FR-036**: Arrival MUST send one arrival notice per affected student.
- **FR-037**: Arrival MUST start a two-minute waiting timer.
- **FR-038**: The **Delivered** action MUST be enabled immediately.
- **FR-039**: The **Customer unavailable** action MUST be disabled for two minutes.
- **FR-040**: Timer expiry MUST enable the unavailable action without changing order state.
- **FR-041**: The shipper MUST be able to continue waiting after the timer.
- **FR-042**: The shipper MUST be able to mark an uncollected order `TEMP_WAITING`.
- **FR-043**: A `TEMP_WAITING` order MAY become `DELIVERED` while the stop remains `ARRIVED`.
- **FR-044**: A stop MUST NOT complete until every order is `DELIVERED` or `TEMP_WAITING`.

## 15.7 Student tracking

- **FR-045**: Students MUST see trip status, current building, remaining buildings, and their route position.
- **FR-046**: Students MUST see the shipper marker on the 2D campus map.
- **FR-047**: Students MUST see an estimated arrival window.
- **FR-048**: The estimated arrival window MUST refresh when mock location or route changes.
- **FR-049**: In-app notices MUST not be duplicated.

## 15.8 Temporary waiting and redelivery

- **FR-050**: A student with a `TEMP_WAITING` order MUST be able to press **I Am Ready**.
- **FR-051**: That action MUST change the order to `TEMP_WAITING_READY`.
- **FR-052**: Student readiness MUST NOT alter the primary route.
- **FR-053**: Redelivery MUST begin only after every primary stop is complete.
- **FR-054**: Only `TEMP_WAITING_READY` orders MUST enter redelivery.
- **FR-055**: The redelivery route MUST be generated through GPT-5.6 analysis and OR-Tools.
- **FR-056**: The shipper MUST confirm the redelivery route.
- **FR-057**: Redelivery activation MUST use the five-second countdown.
- **FR-058**: At retry arrival, **Failed delivery** MUST remain locked for two minutes.
- **FR-059**: A retry order MUST end as `DELIVERED` or `FAILED_DELIVERY`.
- **FR-060**: No retry order may re-enter `TEMP_WAITING`.
- **FR-061**: A `TEMP_WAITING` order that never becomes ready MUST become `FAILED_DELIVERY` when the trip closes.

## 15.9 Route recalculation

- **FR-062**: Only the assigned shipper MUST request recalculation.
- **FR-063**: Recalculation MUST consider only remaining unvisited stops.
- **FR-064**: Current and completed stops MUST remain unchanged.
- **FR-065**: Recalculation MAY be triggered by shipper request, temporarily unavailable stop, or excessive stop delay.
- **FR-066**: The system MUST NOT recalculate on every mock GPS update.
- **FR-067**: The shipper MUST confirm or reject a revised route.
- **FR-068**: Confirmed revised routes MUST activate after a cancellable five-second countdown.

## 15.10 Merchant read-only behavior

- **FR-069**: After the shipper presses **Ready to Deliver**, the merchant MUST have read-only access to that trip.
- **FR-070**: The merchant MUST NOT alter route, stop order, assigned shipper, or delivery outcomes.
- **FR-071**: The merchant MUST be able to monitor progress and outcomes.

## 15.11 Mock GPS

- **FR-072**: The system MUST provide deterministic mock GPS waypoint playback.
- **FR-073**: The system MUST publish a new mock location every five seconds.
- **FR-074**: The frontend MUST interpolate marker movement.
- **FR-075**: The system MUST use the current mock location for initial and revised route calculations.
- **FR-076**: The system MUST preserve mock route progress across page reload.
- **FR-077**: The system MUST provide a demo reset control.

## 15.12 Reliability

- **FR-078**: State-changing actions MUST be idempotent.
- **FR-079**: Every action MUST show loading, success, or failure feedback.
- **FR-080**: The system MUST preserve completed business state across reload.
- **FR-081**: The system MUST provide seeded data for the complete demo.
- **FR-082**: GPT-5.6 failure MUST leave trip state unchanged and show a fallback message.
- **FR-083**: Solver failure MUST leave the current route unchanged.
- **FR-084**: A deterministic baseline route MAY be used when AI is unavailable.

---

## 16. Key Entities

### User

```text
id
name
email
phone
roles
buildingId
createdAt
updatedAt
```

### Merchant

```text
id
ownerUserId
name
description
createdAt
updatedAt
```

### Building

```text
id
code
name
pickupPointName
pickupLatitude
pickupLongitude
mapXRatio
mapYRatio
createdAt
updatedAt
```

### Product

```text
id
merchantId
name
price
category
freshnessRisk
isAvailable
createdAt
updatedAt
```

### Order

```text
id
studentId
merchantId
buildingId
status
readyAt
deliveryAttempt
tripId
stopId
createdAt
updatedAt
```

### MerchantShipperApplication

```text
id
studentId
merchantId
vehicleType
availability
experience
note
status
reviewedByUserId
reviewedAt
createdAt
updatedAt
```

### MerchantShipper

```text
id
studentId
merchantId
isActive
approvedAt
deactivatedAt
createdAt
updatedAt
```

### DeliveryTrip

```text
id
merchantId
shipperStudentId
status
currentStopId
routeVersion
startedAt
completedAt
createdAt
updatedAt
```

### DeliveryStop

```text
id
tripId
buildingId
sequence
passType
status
arrivedAt
minimumWaitEndsAt
completedAt
createdAt
updatedAt
```

`passType`:

```text
PRIMARY
REDELIVERY
```

### RouteRecommendation

```text
id
tripId
recommendationType
snapshotJson
policyJson
currentRouteJson
proposedRouteJson
solverMetricsJson
explanation
status
createdAt
confirmedAt
activatedAt
```

`recommendationType`:

```text
INITIAL
RECALCULATION
REDELIVERY
```

### MockLocationState

```text
tripId
waypointIndex
latitude
longitude
mapXRatio
mapYRatio
recordedAt
playbackStatus
```

### InAppNotification

```text
id
userId
tripId
stopId
type
message
deduplicationKey
createdAt
readAt
```

### AuditEvent

```text
id
actorUserId
merchantId
tripId
eventType
payloadJson
createdAt
```

---

## 17. Realtime Events

### Rooms

```text
trip:{tripId}
merchant:{merchantId}
user:{userId}
```

### Server-to-client events

```text
trip.generation.started
trip.generation.failed
trip.route.proposed
trip.starting
trip.started
trip.updated
trip.completed

mock-location.updated

stop.next
stop.arrived
stop.wait-unlocked
stop.completed
stop.temporarily-unavailable

order.notified
order.delivered
order.temp-waiting
order.temp-waiting-ready
order.redelivery-next
order.failed-delivery

route.recalculation.available
route.recalculation.proposed
route.recalculation.accepted
route.recalculation.rejected
route.recalculation.activated

shipper.application.created
shipper.application.updated
```

---

## 18. User Interface Requirements

## 18.1 Student screens

- Demo sign-in.
- Merchant list.
- Product and order page.
- Order preparation status.
- Active delivery tracking.
- 2D map with mock shipper marker.
- Current and remaining building sequence.
- Estimated arrival window.
- Temporary waiting notice.
- **I Am Ready** action.
- Shipper application form.
- Application status.

## 18.2 Merchant screens

- Demo sign-in.
- Order preparation dashboard.
- Shipper application inbox.
- Approved shipper list.
- Active delivery monitoring.
- Read-only route and stop view.
- Waiting and failed order outcomes.

## 18.3 Shipper screens

- Demo sign-in.
- **Ready to Deliver** action.
- Trip generation loading screen.
- Initial route recommendation.
- Five-second start countdown.
- Mock GPS controls.
- Current route and stop.
- Stop arrival screen.
- Two-minute wait timer.
- Delivered and unavailable actions.
- Temporary unavailable stop action.
- Recalculate remaining route action.
- Revised route comparison.
- Redelivery route confirmation.
- Trip completion summary.

---

## 19. Acceptance Scenarios

## AS-001 — Approve student shipper

**Given** a student has a pending application  
**When** the merchant approves it  
**Then** an active membership is created  
**And** the student gains shipper access for that merchant  
**And** the student cannot hold a second active membership.

## AS-002 — Prepare orders

**Given** the merchant owns seeded orders  
**When** the merchant advances some orders to `READY`  
**Then** only those orders are eligible when a shipper presses **Ready to Deliver**.

## AS-003 — Automatically create trip

**Given** an approved shipper and eligible `READY` orders  
**When** the shipper presses **Ready to Deliver**  
**Then** the system locks all eligible orders  
**And** builds one stop per building  
**And** generates a route through GPT-5.6 plus OR-Tools  
**And** shows the recommendation to the shipper.

## AS-004 — Exclude later-ready order

**Given** the trip has already been generated  
**When** another order becomes `READY`  
**Then** that order is not added to the active trip  
**And** remains available for a future trip.

## AS-005 — Confirm initial route

**Given** a valid route recommendation  
**When** the shipper confirms it  
**Then** a five-second countdown begins  
**And** the shipper may cancel before completion  
**And** the trip starts when the countdown ends.

## AS-006 — Enforce two-minute lock

**Given** the shipper has arrived at C3  
**When** fewer than two minutes have passed  
**Then** Delivered is available  
**And** Customer unavailable is disabled.

## AS-007 — Mark temporary waiting

**Given** the two-minute wait has expired  
**When** the student has not arrived  
**Then** the shipper may mark the order `TEMP_WAITING`  
**And** the system does not change it automatically.

## AS-008 — Student arrives before stop completion

**Given** an order is `TEMP_WAITING` and the stop is still `ARRIVED`  
**When** the student arrives  
**Then** the shipper may mark it `DELIVERED`.

## AS-009 — Student becomes ready after departure

**Given** the stop is completed and the order is `TEMP_WAITING`  
**When** the student presses **I Am Ready**  
**Then** the order becomes `TEMP_WAITING_READY`  
**And** the primary route is unchanged.

## AS-010 — Generate redelivery route

**Given** all primary stops are complete  
**And** at least one order is `TEMP_WAITING_READY`  
**When** the system starts redelivery planning  
**Then** GPT-5.6 evaluates retry priorities  
**And** OR-Tools generates a grouped building route  
**And** the shipper must confirm it.

## AS-011 — Fail student who never became ready

**Given** an order remains `TEMP_WAITING`  
**When** the trip closes after redelivery  
**Then** the order becomes `FAILED_DELIVERY`.

## AS-012 — Enforce one retry

**Given** an order is in `REDELIVERY_NEXT`  
**When** the retry fails  
**Then** the order becomes `FAILED_DELIVERY`  
**And** cannot enter another retry queue.

## AS-013 — Recalculate remaining route

**Given** the trip is in progress with at least two remaining stops  
**When** the shipper requests recalculation  
**Then** GPT-5.6 analyzes a fresh snapshot  
**And** OR-Tools returns a valid remaining route  
**And** current and completed stops are unchanged  
**And** the shipper sees a comparison before confirmation.

## AS-014 — Temporarily unavailable stop

**Given** a remaining stop cannot be served  
**When** the shipper marks it temporarily unavailable  
**Then** recalculation may move it later  
**And** it remains in the trip.

## AS-015 — Merchant cannot intervene

**Given** the shipper has pressed **Ready to Deliver**  
**When** the merchant attempts to change the active route or outcome  
**Then** access is denied  
**And** the merchant retains read-only monitoring.

## AS-016 — Mock GPS movement

**Given** a trip is active  
**When** mock playback advances  
**Then** a location update is published every five seconds  
**And** students see the marker move  
**And** ETA updates.

## AS-017 — AI failure

**Given** GPT-5.6 is unavailable or returns invalid structured output  
**When** route generation is requested  
**Then** no invalid route is applied  
**And** the system shows a clear failure or deterministic fallback.

## AS-018 — Solver validation

**Given** a solver result contains a missing or duplicated stop  
**When** backend validation executes  
**Then** the recommendation is rejected  
**And** the current route remains unchanged.

---

## 20. Success Criteria

- **SC-001**: A presenter can complete the primary happy path in under five minutes using seeded data.
- **SC-002**: All selected orders from the same building appear in exactly one stop.
- **SC-003**: No order becoming `READY` after trip generation enters the active trip.
- **SC-004**: The unavailable action remains disabled for two minutes after arrival.
- **SC-005**: Timer expiry never changes order state without shipper action.
- **SC-006**: Every eligible student receives each required notice exactly once.
- **SC-007**: Cross-merchant access attempts do not expose or mutate protected data.
- **SC-008**: Every generated route includes each eligible stop exactly once.
- **SC-009**: Recalculation never changes current or completed stops.
- **SC-010**: A `TEMP_WAITING_READY` order receives at most one retry.
- **SC-011**: A waiting order that never becomes ready ends as `FAILED_DELIVERY`.
- **SC-012**: Mock GPS publishes one position every five seconds during playback.
- **SC-013**: Students see location and trip-state updates within three seconds under normal local demo conditions.
- **SC-014**: Page reload preserves completed outcomes, active route, countdown target time, and mock GPS progress.
- **SC-015**: Merchant access becomes read-only after trip generation starts.
- **SC-016**: GPT-5.6 or solver failure never corrupts trip, stop, or order state.
- **SC-017**: The complete Must Have demo runs locally on one prepared presenter machine.

---

## 21. Non-Functional Requirements

### NFR-001 — Responsive design

Student and shipper flows must work on common mobile screen sizes.

### NFR-002 — Idempotency

Duplicate actions must not duplicate notices, outcomes, or route changes.

### NFR-003 — Persistence

Business state must survive page reload.

### NFR-004 — AI timeout

GPT-5.6 requests must use a timeout and failure state.

### NFR-005 — Solver time limit

OR-Tools must use a bounded solve time suitable for the demo.

### NFR-006 — Privacy

AI inputs must exclude unnecessary personal data.

### NFR-007 — Auditability

The system must log:

```text
Application submitted
Application approved or rejected
Order became READY
Shipper pressed Ready to Deliver
Trip generation started
GPT-5.6 policy generated
Solver route generated
Route confirmed or rejected
Countdown started or cancelled
Trip started
Stop announced
Stop arrived
Wait unlocked
Order delivered
Order moved to TEMP_WAITING
Student became TEMP_WAITING_READY
Route recalculation requested
Route changed
Redelivery started
Order failed delivery
Trip completed
```

### NFR-008 — Demo reset

The presenter must be able to restore seeded state.

### NFR-009 — Local execution

The complete demo must run locally. Hosted deployment is optional.

---

## 22. Assumptions

- The MVP serves one campus.
- Buildings and pickup points are seeded.
- Travel time between buildings is represented by deterministic demo data.
- Mock GPS follows known campus waypoints.
- The merchant is responsible for moving orders to `READY`.
- The shipper is physically or conceptually at the campus when pressing **Ready to Deliver**.
- One active trip per shipper is sufficient for the MVP.
- In-app notifications are sufficient.
- Payment and pricing are not needed to prove the delivery workflow.
- OR-Tools may return a feasible recommendation rather than a mathematically proven global optimum.

---

## 23. Four-Day Implementation Scope

## Day 1 — Domain and user workflows

- Authentication and roles.
- Merchant ownership.
- Student shipper application.
- Merchant approval.
- Order lifecycle.
- Building and product seed data.
- Trip, stop, and order state models.

## Day 2 — AI and route generation

- Trip-trigger workflow.
- Operational snapshot.
- GPT-5.6 structured output.
- OR-Tools service.
- Backend validation.
- Initial route confirmation.
- Five-second countdown.

## Day 3 — Delivery execution

- Realtime events.
- Mock GPS playback.
- 2D campus map.
- Notifications.
- Stop arrival.
- Two-minute wait lock.
- `TEMP_WAITING`.
- Student readiness.
- Redelivery.
- Remaining-route recalculation.

## Day 4 — Stabilization and submission

- Authorization tests.
- Idempotency checks.
- Seed reset.
- Local setup scripts.
- README.
- English demo script.
- Codex `/feedback` Session ID.
- Public YouTube demo under three minutes.
- Devpost submission.

No major feature may begin on Day 4.

---

## 24. Definition of Done

A feature is complete only when:

1. Backend behavior exists.
2. UI behavior exists.
3. Authorization is enforced.
4. Input and AI output are validated.
5. Loading, success, and error states exist.
6. Seed data covers the behavior.
7. The behavior works in the local demo.
8. Reload does not lose business state.
9. The feature does not break another Must Have flow.

The MVP is complete when all Must Have requirements and acceptance scenarios pass.
