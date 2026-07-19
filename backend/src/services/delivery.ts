import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
} from "drizzle-orm";
import type { Config } from "../config.js";
import type { AppDb } from "../db/index.js";
import {
  auditEvents,
  buildings,
  memberships,
  merchants,
  mockLocations,
  mockWaypoints,
  notifications,
  orders,
  products,
  recommendations,
  stops,
  trips,
} from "../db/schema.js";
import {
  id,
  nowIso,
  OrderStatus,
  RecommendationStatus,
  TripStatus,
  type RecommendationType,
} from "../domain.js";
import { ApiError } from "../errors.js";
import type { Actor } from "../security.js";
import {
  createPolicy,
  solveRoute,
  type OperationalSnapshot,
} from "./optimizer.js";
import {
  buildRouteSections,
  buildTravelTimeMatrix,
  combineRouteSections,
  locationIdForBuilding,
  nearestCampusLocation,
  routePointProjection,
} from "./campus-routing.js";

export async function audit(
  db: AppDb,
  eventType: string,
  actorUserId: string | null,
  merchantId: string | null,
  tripId: string | null,
  payload: unknown = {},
) {
  await db
    .insert(auditEvents)
    .values({
      id: id("audit"),
      actorUserId,
      merchantId,
      tripId,
      eventType,
      payloadJson: JSON.stringify(payload),
      createdAt: nowIso(),
    });
}
export async function notify(
  db: AppDb,
  userId: string,
  tripId: string | null,
  stopId: string | null,
  type: string,
  message: string,
  key: string,
) {
  await db
    .insert(notifications)
    .values({
      id: id("notice"),
      userId,
      tripId,
      stopId,
      type,
      message,
      deduplicationKey: key,
      createdAt: nowIso(),
      readAt: null,
    })
    .onConflictDoNothing();
}
export async function activeMembership(db: AppDb, actor: Actor) {
  const row = (
    await db
      .select({ membership: memberships })
      .from(memberships)
      .innerJoin(merchants, eq(merchants.id, memberships.merchantId))
      .where(
        and(
          eq(memberships.studentId, actor.id),
          eq(memberships.isActive, true),
          eq(merchants.status, "APPROVED"),
        ),
      )
      .limit(1)
  )[0];
  if (!row)
    throw new ApiError(
      403,
      "shipper_membership_required",
      "An active approved merchant membership is required",
    );
  return row.membership;
}
export async function assertAssignedShipper(
  db: AppDb,
  actor: Actor,
  tripId: string,
) {
  const trip = (
    await db.select().from(trips).where(eq(trips.id, tripId)).limit(1)
  )[0];
  if (!trip) throw new ApiError(404, "not_found", "Trip not found");
  if (trip.shipperStudentId !== actor.id)
    throw new ApiError(
      403,
      "forbidden",
      "Only the assigned shipper may perform this action",
    );
  const member = await activeMembership(db, actor);
  if (member.merchantId !== trip.merchantId)
    throw new ApiError(
      403,
      "forbidden",
      "Trip is outside active merchant membership",
    );
  return trip;
}

export async function buildSnapshot(
  db: AppDb,
  tripId: string,
): Promise<OperationalSnapshot> {
  const trip = (
    await db.select().from(trips).where(eq(trips.id, tripId)).limit(1)
  )[0];
  if (!trip) throw new ApiError(404, "not_found", "Trip not found");
  const allStops = await db
    .select()
    .from(stops)
    .where(eq(stops.tripId, tripId))
    .orderBy(asc(stops.sequence));
  // The active/current stop is a fixed prefix, never a solver candidate (BR-020/FR-064).
  const remaining = allStops.filter(
    (s) =>
      !["COMPLETED", "RETRY_COMPLETED"].includes(s.status) &&
      s.id !== trip.currentStopId,
  );
  const candidateStopIds = remaining.map((s) => s.id);
  const orderRows = candidateStopIds.length
    ? await db
        .select({ order: orders, product: products })
        .from(orders)
        .innerJoin(products, eq(orders.productId, products.id))
        .where(
          and(
            eq(orders.tripId, tripId),
            inArray(orders.stopId, candidateStopIds),
            inArray(orders.status, [
              "ASSIGNED_TO_TRIP",
              "NOTIFIED_TO_COME_DOWN",
              "TEMP_WAITING_READY",
              "REDELIVERY_NEXT",
            ]),
          ),
        )
    : [];
  const buildingIds = [...new Set(remaining.map((s) => s.buildingId))];
  const buildingRows = buildingIds.length
    ? await db
        .select()
        .from(buildings)
        .where(inArray(buildings.id, buildingIds))
    : [];
  const location =
    (
      await db
        .select()
        .from(mockLocations)
        .where(eq(mockLocations.tripId, tripId))
        .limit(1)
    )[0] ??
    (
      await db
        .select()
        .from(mockWaypoints)
        .orderBy(asc(mockWaypoints.waypointIndex))
        .limit(1)
    )[0];
  if (!location)
    throw new ApiError(
      500,
      "mock_location_missing",
      "Mock GPS seed is missing",
    );
  const startLocationId = nearestCampusLocation(location.longitude, location.latitude).location.id;
  const travelTimeMatrix = buildTravelTimeMatrix(buildingRows.map((building) => building.id), startLocationId);
  return {
    generatedAt: nowIso(),
    startLocationId,
    merchantId: trip.merchantId,
    shipper: {
      shipperId: trip.shipperStudentId,
      currentLatitude: location.latitude,
      currentLongitude: location.longitude,
      locationTimestamp:
        "recordedAt" in location ? location.recordedAt : nowIso(),
    },
    orders: orderRows.map(({ order, product }) => ({
      orderId: order.id,
      buildingId: order.buildingId,
      status: (order.status === "TEMP_WAITING_READY" ||
      order.status === "REDELIVERY_NEXT"
        ? order.status
        : "READY") as "READY" | "TEMP_WAITING_READY" | "REDELIVERY_NEXT",
      readyAt: order.readyAt,
      minutesWaiting: order.readyAt
        ? Math.max(0, (Date.now() - Date.parse(order.readyAt)) / 60000)
        : 0,
      foodCategory: product.category,
      freshnessRisk: product.freshnessRisk as "LOW" | "MEDIUM" | "HIGH",
      deliveryAttempt: order.deliveryAttempt as 1 | 2,
    })),
    buildings: buildingRows.map((b) => ({
      buildingId: b.id,
      pickupLatitude: b.pickupLatitude,
      pickupLongitude: b.pickupLongitude,
      mapXRatio: b.mapXRatio,
      mapYRatio: b.mapYRatio,
    })),
    remainingStops: remaining.map((s) => ({
      stopId: s.id,
      buildingId: s.buildingId,
      status: s.status,
      sequence: s.sequence,
      temporarilyUnavailable: s.temporarilyUnavailable,
    })),
    completedStopIds: allStops
      .filter((s) => ["COMPLETED", "RETRY_COMPLETED"].includes(s.status))
      .map((s) => s.id),
    currentStopId: trip.currentStopId,
    travelTimeMatrix,
  };
}

export async function generateRecommendation(
  db: AppDb,
  config: Config,
  tripId: string,
  type: RecommendationType,
  actorId: string,
) {
  const snapshot = await buildSnapshot(db, tripId);
  if (!snapshot.remainingStops.length)
    throw new ApiError(
      409,
      "no_remaining_stops",
      "No eligible remaining stops",
    );
  const ai = await createPolicy(config, snapshot);
  const solved = await solveRoute(config, snapshot, ai.policy);
  const current = snapshot.remainingStops
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => s.stopId);
  const rec = {
    id: id("route"),
    tripId,
    recommendationType: type,
    snapshotJson: JSON.stringify(snapshot),
    policyJson: JSON.stringify({
      ...ai.policy,
      source: ai.source,
      promptVersion: ai.promptVersion,
      warning: ai.warning,
    }),
    currentRouteJson: JSON.stringify(current),
    proposedRouteJson: JSON.stringify(solved.result.orderedStopIds),
    solverMetricsJson: JSON.stringify({
      ...solved.result,
      source: solved.source,
      warning: solved.warning,
    }),
    explanationJson: JSON.stringify([
      ...ai.policy.explanation,
      ...[ai.warning, solved.warning].filter(Boolean),
    ]),
    status: RecommendationStatus.PROPOSED,
    createdAt: nowIso(),
    confirmedAt: null,
    activatedAt: null,
  };
  await db.insert(recommendations).values(rec);
  const trip = (
    await db.select().from(trips).where(eq(trips.id, tripId)).limit(1)
  )[0];
  await audit(db, "SOLVER_ROUTE_GENERATED", actorId, trip.merchantId, tripId, {
    recommendationId: rec.id,
    type,
    solverSource: solved.source,
    aiSource: ai.source,
    promptVersion: ai.promptVersion,
  });
  return rec;
}

export type DemoStartLocation = {
  latitude: number;
  longitude: number;
  recordedAt: string;
  source: "DEMO_GATE";
};

export async function createTrip(
  db: AppDb,
  config: Config,
  actor: Actor,
  startLocation?: DemoStartLocation,
) {
  const member = await activeMembership(db, actor);
  const active = (
    await db
      .select()
      .from(trips)
      .where(
        and(
          eq(trips.shipperStudentId, actor.id),
          inArray(trips.status, [
            "DRAFT_GENERATING",
            "AWAITING_SHIPPER_CONFIRMATION",
            "STARTING",
            "IN_PROGRESS",
            "REDELIVERY",
          ]),
        ),
      )
      .limit(1)
  )[0];
  if (active)
    throw new ApiError(
      409,
      "active_trip_exists",
      "Shipper already has an active trip",
    );
  const now = nowIso(),
    tripId = id("trip");
  await db.transaction(async (tx) => {
    const eligible = await tx
      .select({ id: orders.id, buildingId: orders.buildingId })
      .from(orders)
      .where(
        and(
          eq(orders.merchantId, member.merchantId),
          eq(orders.status, OrderStatus.READY),
          isNull(orders.tripId),
        ),
      )
      .orderBy(asc(orders.createdAt), asc(orders.id))
      .for("update");
    if (!eligible.length)
      throw new ApiError(409, "no_ready_orders", "No ready orders available");
    await tx
      .insert(trips)
      .values({
        id: tripId,
        merchantId: member.merchantId,
        shipperStudentId: actor.id,
        status: TripStatus.DRAFT_GENERATING,
        currentStopId: null,
        routeVersion: 1,
        countdownEndsAt: null,
        startedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    const buildingIds = [...new Set(eligible.map((order) => order.buildingId))];
    for (let index = 0; index < buildingIds.length; index++) {
      const buildingId = buildingIds[index],
        stopId = id("stop");
      await tx
        .insert(stops)
        .values({
          id: stopId,
          tripId,
          buildingId,
          sequence: index + 1,
          passType: "PRIMARY",
          status: "WAITING",
          temporarilyUnavailable: false,
          arrivedAt: null,
          minimumWaitEndsAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      const claimed = await tx
        .update(orders)
        .set({
          tripId,
          stopId,
          status: OrderStatus.ASSIGNED_TO_TRIP,
          updatedAt: now,
        })
        .where(
          and(
            eq(orders.merchantId, member.merchantId),
            eq(orders.buildingId, buildingId),
            eq(orders.status, OrderStatus.READY),
            isNull(orders.tripId),
          ),
        )
        .returning({ id: orders.id });
      const expected = eligible.filter(
        (order) => order.buildingId === buildingId,
      ).length;
      if (claimed.length !== expected)
        throw new Error("READY order claim changed concurrently");
    }
    const waypoint = (
      await tx
        .select()
        .from(mockWaypoints)
        .orderBy(asc(mockWaypoints.waypointIndex))
        .limit(1)
    )[0];
    if (!waypoint)
      throw new ApiError(
        500,
        "mock_location_missing",
        "Mock GPS seed is missing",
      );
    if (startLocation) {
      const nearest = nearestCampusLocation(
        startLocation.longitude,
        startLocation.latitude,
      );
      if (
        nearest.location.id !== "CAMPUS_DEPOT" ||
        nearest.distanceMeters > 30
      )
        throw new ApiError(
          422,
          "invalid_demo_start_location",
          "Demo shipper must start within 30 metres of the campus entry gate",
        );
    }
    await tx
      .insert(mockLocations)
      .values({
        tripId,
        waypointIndex: waypoint.waypointIndex,
        latitude: startLocation?.latitude ?? waypoint.latitude,
        longitude: startLocation?.longitude ?? waypoint.longitude,
        mapXRatio: startLocation ? 0 : waypoint.mapXRatio,
        mapYRatio: startLocation ? 0 : waypoint.mapYRatio,
        recordedAt: startLocation?.recordedAt ?? now,
        playbackStatus: config.demoMode ? "ARMED" : "STOPPED",
      });
    await tx
      .insert(auditEvents)
      .values({
        id: id("audit"),
        actorUserId: actor.id,
        merchantId: member.merchantId,
        tripId,
        eventType: "TRIP_GENERATION_STARTED",
        payloadJson: JSON.stringify({
          orderCount: eligible.length,
          startLocationSource: startLocation?.source ?? "SEEDED_GATE",
        }),
        createdAt: now,
      });
  });
  try {
    const rec = await generateRecommendation(
      db,
      config,
      tripId,
      "INITIAL",
      actor.id,
    );
    await db
      .update(trips)
      .set({
        status: TripStatus.AWAITING_SHIPPER_CONFIRMATION,
        updatedAt: nowIso(),
      })
      .where(eq(trips.id, tripId));
    return { tripId, recommendationId: rec.id };
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx
        .delete(recommendations)
        .where(eq(recommendations.tripId, tripId));
      await tx.delete(mockLocations).where(eq(mockLocations.tripId, tripId));
      await tx.delete(stops).where(eq(stops.tripId, tripId));
      await tx
        .update(orders)
        .set({
          tripId: null,
          stopId: null,
          status: OrderStatus.READY,
          updatedAt: nowIso(),
        })
        .where(eq(orders.tripId, tripId));
      await tx.delete(auditEvents).where(eq(auditEvents.tripId, tripId));
      await tx.delete(trips).where(eq(trips.id, tripId));
    });
    throw error;
  }
}

export async function activateRecommendation(
  db: AppDb,
  recommendationId: string,
  actorId: string | null = null,
) {
  const rec = (
    await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.id, recommendationId))
      .limit(1)
  )[0];
  if (!rec) throw new ApiError(404, "not_found", "Recommendation not found");
  const trip = (
    await db.select().from(trips).where(eq(trips.id, rec.tripId)).limit(1)
  )[0];
  if (!trip) throw new ApiError(404, "not_found", "Trip not found");
  if (rec.status === RecommendationStatus.ACTIVATED) return trip;
  if (rec.status !== RecommendationStatus.CONFIRMED || !trip.countdownEndsAt)
    throw new ApiError(
      409,
      "invalid_recommendation_state",
      "Route is not confirmed",
    );
  if (Date.now() < Date.parse(trip.countdownEndsAt))
    throw new ApiError(
      409,
      "countdown_active",
      "Five-second countdown has not completed",
    );
  const claimed = await db
    .update(recommendations)
    .set({ status: RecommendationStatus.ACTIVATED, activatedAt: nowIso() })
    .where(
      and(
        eq(recommendations.id, rec.id),
        eq(recommendations.status, RecommendationStatus.CONFIRMED),
      ),
    )
    .returning({ id: recommendations.id });
  if (!claimed.length)
    return (
      await db.select().from(trips).where(eq(trips.id, trip.id)).limit(1)
    )[0];
  const ordered: string[] = JSON.parse(rec.proposedRouteJson);
  const allTripStops = await db
    .select()
    .from(stops)
    .where(eq(stops.tripId, trip.id));
  const candidateSet = new Set(ordered),
    candidatePass = allTripStops.find((s) => candidateSet.has(s.id))?.passType;
  const fixedPrefix = allTripStops.filter(
    (s) => s.passType === candidatePass && !candidateSet.has(s.id),
  );
  const sequenceOffset =
    rec.recommendationType === "RECALCULATION"
      ? Math.max(0, ...fixedPrefix.map((s) => s.sequence))
      : 0;
  for (let i = 0; i < ordered.length; i++)
    await db
      .update(stops)
      .set({ sequence: sequenceOffset + i + 1, updatedAt: nowIso() })
      .where(and(eq(stops.id, ordered[i]), eq(stops.tripId, trip.id)));
  if (rec.recommendationType === "INITIAL") {
    const first = ordered[0];
    await db.update(stops).set({ status: "NEXT" }).where(eq(stops.id, first));
    await db
      .update(trips)
      .set({
        status: TripStatus.IN_PROGRESS,
        currentStopId: first,
        countdownEndsAt: null,
        startedAt: nowIso(),
        routeVersion: trip.routeVersion + 1,
        updatedAt: nowIso(),
      })
      .where(eq(trips.id, trip.id));
    for (const order of await db
      .select()
      .from(orders)
      .where(eq(orders.tripId, trip.id)))
      await notify(
        db,
        order.studentId,
        trip.id,
        null,
        "TRIP_STARTED",
        "Your delivery trip has started.",
        `${trip.id}:${order.studentId}:trip-start`,
      );
  } else if (rec.recommendationType === "REDELIVERY") {
    const first = ordered[0];
    await db
      .update(stops)
      .set({ status: "RETRY_NEXT" })
      .where(eq(stops.id, first));
    await db
      .update(trips)
      .set({
        status: TripStatus.REDELIVERY,
        currentStopId: first,
        countdownEndsAt: null,
        routeVersion: trip.routeVersion + 1,
        updatedAt: nowIso(),
      })
      .where(eq(trips.id, trip.id));
    await db
      .update(orders)
      .set({
        status: OrderStatus.REDELIVERY_NEXT,
        deliveryAttempt: 2,
        updatedAt: nowIso(),
      })
      .where(
        and(
          eq(orders.tripId, trip.id),
          eq(orders.status, OrderStatus.TEMP_WAITING_READY),
        ),
      );
  } else
    await db
      .update(trips)
      .set({
        countdownEndsAt: null,
        routeVersion: trip.routeVersion + 1,
        updatedAt: nowIso(),
      })
      .where(eq(trips.id, trip.id));
  await audit(db, "ROUTE_ACTIVATED", actorId, trip.merchantId, trip.id, {
    recommendationId: rec.id,
    type: rec.recommendationType,
  });
  await snapMockLocationToRoute(db, trip.id);
  await db
    .update(mockLocations)
    .set({ playbackStatus: "PLAYING", recordedAt: nowIso() })
    .where(eq(mockLocations.tripId, trip.id));
  return (
    await db.select().from(trips).where(eq(trips.id, trip.id)).limit(1)
  )[0];
}

export async function reconcileCountdown(db: AppDb, tripId: string) {
  const trip = (
    await db.select().from(trips).where(eq(trips.id, tripId)).limit(1)
  )[0];
  if (trip?.countdownEndsAt && Date.now() >= Date.parse(trip.countdownEndsAt)) {
    const rec = (
      await db
        .select()
        .from(recommendations)
        .where(
          and(
            eq(recommendations.tripId, tripId),
            eq(recommendations.status, RecommendationStatus.CONFIRMED),
          ),
        )
        .orderBy(desc(recommendations.createdAt))
        .limit(1)
    )[0];
    if (rec) await activateRecommendation(db, rec.id, null);
  }
}
export async function tickCountdowns(db: AppDb) {
  const due = await db
    .select()
    .from(trips)
    .where(isNotNull(trips.countdownEndsAt));
  for (const trip of due)
    if (trip.countdownEndsAt && Date.now() >= Date.parse(trip.countdownEndsAt))
      await reconcileCountdown(db, trip.id);
}

export async function tickMockGps(db: AppDb, intervalMs = 1000) {
  const playing = await db
    .select()
    .from(mockLocations)
    .where(eq(mockLocations.playbackStatus, "PLAYING"));
  for (const location of playing) {
    if (Date.now() - Date.parse(location.recordedAt) < intervalMs) continue;
    await advanceMockGps(db, location.tripId);
  }
}

type TripRow = typeof trips.$inferSelect;
type StopRow = typeof stops.$inferSelect;
type RecommendationRow = typeof recommendations.$inferSelect;
type MockLocationRow = typeof mockLocations.$inferSelect;

function orderedPassStops(tripStops: StopRow[], passType: "PRIMARY" | "REDELIVERY") {
  return tripStops
    .filter((stop) => stop.passType === passType)
    .sort((left, right) => left.sequence - right.sequence || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

function activeRouteStops(trip: TripRow, tripStops: StopRow[]) {
  const primaryStops = orderedPassStops(tripStops, "PRIMARY");
  if (![TripStatus.REDELIVERY, TripStatus.COMPLETED].includes(trip.status as any)) return primaryStops;
  return [...primaryStops, ...orderedPassStops(tripStops, "REDELIVERY")];
}

function proposedRouteStops(recommendation: RecommendationRow, tripStops: StopRow[]) {
  const proposedIds = JSON.parse(recommendation.proposedRouteJson) as string[];
  const stopMap = new Map(tripStops.map((stop) => [stop.id, stop]));
  const orderedStops = proposedIds
    .map((stopId) => stopMap.get(stopId))
    .filter((stop): stop is StopRow => Boolean(stop));
  return orderedStops;
}

function projectedMockLocation(trip: TripRow, tripStops: StopRow[], location: MockLocationRow) {
  const routeGeoJson = combineRouteSections(buildRouteSections(activeRouteStops(trip, tripStops)));
  return {
    ...location,
    ...routePointProjection(
      routeGeoJson.geometry.coordinates,
      location.longitude,
      location.latitude,
      location.waypointIndex,
    ),
    routeVersion: trip.routeVersion,
  };
}

export async function advanceMockGps(db: AppDb, tripId: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  const [location] = await db.select().from(mockLocations).where(eq(mockLocations.tripId, tripId)).limit(1);
  if (!trip || !location) throw new ApiError(404, "not_found", "Trip or mock location not found");
  if (![TripStatus.IN_PROGRESS, TripStatus.REDELIVERY].includes(trip.status as any)) {
    if (trip.status !== TripStatus.COMPLETED) throw new ApiError(409, "invalid_trip_state", "Trip is not active");
    const [stopped] = await db.update(mockLocations).set({ playbackStatus: "COMPLETED" }).where(eq(mockLocations.tripId, tripId)).returning();
    return stopped;
  }
  const tripStops = await db.select().from(stops).where(eq(stops.tripId, trip.id));
  const sections = buildRouteSections(activeRouteStops(trip, tripStops));
  const coordinates = combineRouteSections(sections).geometry.coordinates;
  const currentSectionIndex = sections.findIndex(
    (section) => section.destinationStopId === trip.currentStopId,
  );
  if (currentSectionIndex < 0) {
    const [waiting] = await db.update(mockLocations).set({ playbackStatus: "WAITING_AT_STOP", recordedAt: nowIso() }).where(eq(mockLocations.tripId, tripId)).returning();
    return waiting;
  }
  const currentStopEndIndex = Math.max(
    0,
    combineRouteSections(sections.slice(0, currentSectionIndex + 1)).geometry.coordinates.length - 1,
  );
  const projection = routePointProjection(coordinates, location.longitude, location.latitude, location.waypointIndex);
  if (projection.coordinateIndex >= currentStopEndIndex) {
    const [waiting] = await db.update(mockLocations).set({ playbackStatus: "WAITING_AT_STOP", recordedAt: nowIso() }).where(eq(mockLocations.tripId, tripId)).returning();
    return waiting;
  }
  const nextIndex = Math.min(projection.coordinateIndex + 1, currentStopEndIndex);
  const next = coordinates[nextIndex];
  if (!next || nextIndex === projection.coordinateIndex) {
    const [waiting] = await db.update(mockLocations).set({ playbackStatus: "WAITING_AT_STOP", recordedAt: nowIso() }).where(eq(mockLocations.tripId, tripId)).returning();
    return waiting;
  }
  const [updated] = await db.update(mockLocations).set({
    waypointIndex: nextIndex,
    latitude: next[1],
    longitude: next[0],
    mapXRatio: 0,
    mapYRatio: 0,
    playbackStatus: nextIndex === currentStopEndIndex ? "WAITING_AT_STOP" : "PLAYING",
    recordedAt: nowIso(),
  }).where(eq(mockLocations.tripId, tripId)).returning();
  return updated;
}

async function snapMockLocationToRoute(db: AppDb, tripId: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  const [location] = await db.select().from(mockLocations).where(eq(mockLocations.tripId, tripId)).limit(1);
  if (!trip || !location) return;
  const tripStops = await db.select().from(stops).where(eq(stops.tripId, tripId));
  const coordinates = combineRouteSections(buildRouteSections(activeRouteStops(trip, tripStops))).geometry.coordinates;
  const projection = routePointProjection(coordinates, location.longitude, location.latitude);
  const coordinate = coordinates[projection.coordinateIndex];
  if (!coordinate) return;
  await db.update(mockLocations).set({
    waypointIndex: projection.coordinateIndex,
    longitude: coordinate[0],
    latitude: coordinate[1],
    recordedAt: nowIso(),
  }).where(eq(mockLocations.tripId, tripId));
}

export async function mockLocationView(db: AppDb, tripId: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  const [location] = await db.select().from(mockLocations).where(eq(mockLocations.tripId, tripId)).limit(1);
  if (!trip || !location) throw new ApiError(404, "not_found", "Trip or mock location not found");
  const tripStops = await db.select().from(stops).where(eq(stops.tripId, tripId));
  return projectedMockLocation(trip, tripStops, location);
}

export async function tripView(db: AppDb, tripId: string) {
  await reconcileCountdown(db, tripId);
  const trip = (
    await db.select().from(trips).where(eq(trips.id, tripId)).limit(1)
  )[0];
  if (!trip) throw new ApiError(404, "not_found", "Trip not found");
  const [tripStops, tripOrders, recs, location] = await Promise.all([
    db
      .select()
      .from(stops)
      .where(eq(stops.tripId, tripId))
      .orderBy(asc(stops.sequence)),
    db.select().from(orders).where(eq(orders.tripId, tripId)),
    db.select().from(recommendations).where(eq(recommendations.tripId, tripId)),
    db
      .select()
      .from(mockLocations)
      .where(eq(mockLocations.tripId, tripId))
      .limit(1),
  ]);
  const latestRecommendation = [...recs].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).at(-1);
  const proposedRecommendation = latestRecommendation && ["PROPOSED", "CONFIRMED"].includes(latestRecommendation.status) ? latestRecommendation : null;
  const routeSections = buildRouteSections(activeRouteStops(trip, tripStops));
  const routeGeoJson = combineRouteSections(routeSections);
  const proposedSnapshot = proposedRecommendation
    ? JSON.parse(proposedRecommendation.snapshotJson) as { startLocationId?: string }
    : null;
  const proposedRouteSections = proposedRecommendation
    ? buildRouteSections(
        proposedRouteStops(proposedRecommendation, tripStops),
        proposedSnapshot?.startLocationId ?? "CAMPUS_DEPOT",
      )
    : [];
  const proposedRouteGeoJson = proposedRouteSections.length ? combineRouteSections(proposedRouteSections) : null;
  const rawLocation = location[0] ?? null;
  const projectedLocation = rawLocation ? projectedMockLocation(trip, tripStops, rawLocation) : null;
  const activeStops = activeRouteStops(trip, tripStops);
  const activeTravelMinutes = routeSections.reduce((total, section) => total + section.travelSeconds, 0) / 60;
  const remainingServiceMinutes = activeStops.filter((stop) => !["COMPLETED", "RETRY_COMPLETED"].includes(stop.status)).length * 3;
  const remainingEstimatedMinutes = Math.max(
    0,
    activeTravelMinutes * (1 - (projectedLocation?.progressRatio ?? 0)) + remainingServiceMinutes,
  );
  return {
    ...trip,
    stops: tripStops,
    orders: tripOrders,
    recommendations: recs.map((r) => ({
      ...r,
      snapshot: JSON.parse(r.snapshotJson),
      policy: JSON.parse(r.policyJson),
      currentRoute: JSON.parse(r.currentRouteJson),
      proposedRoute: JSON.parse(r.proposedRouteJson),
      solverMetrics: JSON.parse(r.solverMetricsJson),
      explanation: JSON.parse(r.explanationJson),
    })),
    routeGeoJson,
    routeSections,
    activeRouteGeoJson: routeGeoJson,
    activeRouteSections: routeSections,
    proposedRouteGeoJson,
    proposedRouteSections,
    mockLocation: projectedLocation,
    remainingEstimatedMinutes,
  };
}
