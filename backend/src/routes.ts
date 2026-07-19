import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Config } from "./config.js";
import type { AppDb } from "./db/index.js";
import {
  applications,
  auditEvents,
  buildings,
  idempotencyRecords,
  memberships,
  merchants,
  mockLocations,
  mockWaypoints,
  notifications,
  orders,
  products,
  recommendations,
  sessions,
  stops,
  trips,
  users,
} from "./db/schema.js";
import {
  id,
  nowIso,
  OrderStatus,
  RecommendationStatus,
  restaurantTransitions,
  Role,
  TripStatus,
} from "./domain.js";
import { ApiError } from "./errors.js";
import {
  authenticate,
  AUTH_COOKIE,
  hashToken,
  requestAccessToken,
  requireRole,
  signAccessToken,
  verifyPassword,
  type Actor,
} from "./security.js";
import {
  activateRecommendation,
  advanceMockGps,
  activeMembership,
  assertAssignedShipper,
  audit,
  createTrip,
  generateRecommendation,
  mockLocationView,
  notify,
  tripView,
} from "./services/delivery.js";
import { campusLayoutPayload, campusRoutePayload } from "./services/campus-routing.js";
import { resetSeed } from "./seed.js";

const envelope = (data: unknown) => ({ data });
const parseBody = <T>(schema: z.ZodType<T>, request: FastifyRequest) =>
  schema.parse(request.body);
const param = (request: FastifyRequest, name: string) =>
  (request.params as Record<string, string>)[name];
const queryPage = (request: FastifyRequest) => {
  const q = request.query as Record<string, string>;
  return {
    page: Math.max(1, Number(q.page) || 1),
    perPage: Math.min(100, Math.max(1, Number(q.per_page) || 20)),
  };
};
const paginate = <T>(rows: T[], page: number, perPage: number) => ({
  data: rows.slice((page - 1) * perPage, page * perPage),
  meta: {
    total: rows.length,
    page,
    per_page: perPage,
    total_pages: Math.ceil(rows.length / perPage),
  },
});

async function merchantOwnedBy(db: AppDb, actor: Actor, merchantId?: string) {
  requireRole(actor, Role.MERCHANT);
  const row = (
    await db
      .select()
      .from(merchants)
      .where(
        and(
          eq(merchants.ownerUserId, actor.id),
          ...(merchantId ? [eq(merchants.id, merchantId)] : []),
        ),
      )
      .limit(1)
  )[0];
  if (!row) throw new ApiError(403, "forbidden", "Merchant ownership required");
  if (row.status !== "APPROVED")
    throw new ApiError(
      403,
      "merchant_not_approved",
      "Merchant approval is required for operations",
    );
  return row;
}
async function canViewTrip(db: AppDb, actor: Actor, tripId: string) {
  const trip = (
    await db.select().from(trips).where(eq(trips.id, tripId)).limit(1)
  )[0];
  if (!trip) throw new ApiError(404, "not_found", "Trip not found");
  if (actor.roles.includes(Role.ADMIN) || trip.shipperStudentId === actor.id)
    return trip;
  const owned = (
    await db
      .select()
      .from(merchants)
      .where(
        and(
          eq(merchants.id, trip.merchantId),
          eq(merchants.ownerUserId, actor.id),
        ),
      )
      .limit(1)
  )[0];
  if (owned?.status === "APPROVED") return trip;
  const ownOrder = (
    await db
      .select()
      .from(orders)
      .where(and(eq(orders.tripId, tripId), eq(orders.studentId, actor.id)))
      .limit(1)
  )[0];
  if (ownOrder) return trip;
  throw new ApiError(403, "forbidden", "Trip access denied");
}
function tripProjection(actor: Actor, view: any) {
  if (
    actor.roles.some((role) =>
      [Role.ADMIN, Role.MERCHANT, Role.SHIPPER].includes(role as any),
    )
  )
    return view;
  return studentTripProjection(actor, view);
}

function routeDistanceMeters(coordinates: [number, number][]) {
  let distance = 0;
  for (let index = 1; index < coordinates.length; index += 1)
    distance += Math.hypot(
      (coordinates[index][0] - coordinates[index - 1][0]) * 109300,
      (coordinates[index][1] - coordinates[index - 1][1]) * 111000,
    );
  return distance;
}

function studentRouteToStop(view: any, stopId: string) {
  const sections = (view.routeSections ?? []) as Array<{
    id: string;
    destinationStopId: string;
    toLocationId: string;
    geometry: { geometry: { coordinates: [number, number][] } };
  }>;
  const targetSectionIndex = sections.findIndex((section) => section.destinationStopId === stopId);
  const fullCoordinates = (view.routeGeoJson?.geometry?.coordinates ?? []) as [number, number][];
  if (targetSectionIndex < 0 || !fullCoordinates.length) return null;
  let targetEndIndex = -1;
  for (let index = 0; index <= targetSectionIndex; index += 1)
    targetEndIndex += sections[index].geometry.geometry.coordinates.length - (index === 0 ? 0 : 1);
  const projectedIndex = Math.max(0, Math.min(view.mockLocation?.coordinateIndex ?? 0, fullCoordinates.length - 1));
  const targetCoordinate = fullCoordinates[targetEndIndex];
  let coordinates = projectedIndex <= targetEndIndex
    ? fullCoordinates.slice(projectedIndex, targetEndIndex + 1)
    : [targetCoordinate];
  if (coordinates.length === 1) coordinates = [coordinates[0], coordinates[0]];
  const distanceMeters = Math.round(routeDistanceMeters(coordinates));
  const targetSection = sections[targetSectionIndex];
  const section = {
    id: `student-current-to-${stopId}`,
    fromLocationId: "SHIPPER_CURRENT",
    toLocationId: targetSection.toLocationId,
    destinationStopId: stopId,
    distanceMeters,
    travelSeconds: Math.max(0, Math.round(distanceMeters / 3.6)),
    geometry: {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    },
  };
  return {
    section,
    feature: {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    },
    etaMinutes: distanceMeters / 3.6 / 60,
  };
}

function studentTripProjection(actor: Actor, view: any) {
  const ownOrders = (view.orders ?? []).filter(
    (order: { studentId: string }) => order.studentId === actor.id,
  );
  const ownStopIds = new Set(ownOrders.map((order: { stopId?: string }) => order.stopId).filter(Boolean));
  const ownStops = (view.stops ?? []).filter((stop: { id: string }) => ownStopIds.has(stop.id));
  const trackingStop = ownStops.find((stop: { id: string; announcedAt?: string | null; status: string }) =>
    Boolean(stop.announcedAt) && !["COMPLETED", "RETRY_COMPLETED"].includes(stop.status),
  );
  const base = {
    ...view,
    orders: ownOrders,
    stops: ownStops,
    recommendations: [],
    currentStopId: null,
    routeGeoJson: null,
    routeSections: [],
    activeRouteGeoJson: null,
    activeRouteSections: [],
    proposedRouteGeoJson: null,
    proposedRouteSections: [],
    mockLocation: view.mockLocation,
    remainingEstimatedMinutes: null,
    studentTracking: {
      visible: false,
      locationVisible: Boolean(view.mockLocation),
      routeVisible: false,
      state: "WAITING_FOR_ANNOUNCEMENT",
      stopId: ownStops[0]?.id ?? null,
      buildingId: ownStops[0]?.buildingId ?? null,
      announcedAt: null,
    },
  };
  if (!trackingStop || !view.mockLocation) return base;
  const route = studentRouteToStop(view, trackingStop.id);
  if (!route) return base;
  const arrived = ["ARRIVED", "RETRY_ARRIVED"].includes(trackingStop.status);
  return {
    ...base,
    stops: [trackingStop],
    currentStopId: trackingStop.id,
    routeGeoJson: route.feature,
    routeSections: [route.section],
    activeRouteGeoJson: route.feature,
    activeRouteSections: [route.section],
    mockLocation: view.mockLocation,
    remainingEstimatedMinutes: arrived ? 0 : route.etaMinutes,
    studentTracking: {
      visible: true,
      locationVisible: true,
      routeVisible: true,
      state: arrived ? "ARRIVED" : "ON_THE_WAY",
      stopId: trackingStop.id,
      buildingId: trackingStop.buildingId,
      announcedAt: trackingStop.announcedAt,
    },
  };
}
async function identityContext(db: AppDb, userId: string) {
  const merchant = (
    await db
      .select()
      .from(merchants)
      .where(eq(merchants.ownerUserId, userId))
      .limit(1)
  )[0];
  const membership = (
    await db
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.studentId, userId), eq(memberships.isActive, true)),
      )
      .limit(1)
  )[0];
  return {
    merchant_id: merchant?.id ?? null,
    merchant_status: merchant?.status ?? null,
    active_membership: membership
      ? { id: membership.id, merchant_id: membership.merchantId }
      : null,
  };
}
async function reviewApplicationAtomic(
  db: AppDb,
  applicationId: string,
  merchantId: string,
  actorId: string,
  decision: "APPROVED" | "REJECTED",
) {
  return db.transaction(async (tx) => {
    const now = nowIso();
    const application = (
      await tx
        .select()
        .from(applications)
        .where(
          and(
            eq(applications.id, applicationId),
            eq(applications.merchantId, merchantId),
          ),
        )
        .limit(1)
        .for("update")
    )[0];
    if (!application)
      throw new ApiError(404, "not_found", "Application not found");
    if (application.status === decision) return application;
    if (application.status !== "PENDING")
      throw new ApiError(
        409,
        "invalid_application_state",
        "Only pending applications can be reviewed",
      );
    if (decision === "APPROVED") {
      const current = (
        await tx
          .select()
          .from(memberships)
          .where(
            and(
              eq(memberships.studentId, application.studentId),
              eq(memberships.isActive, true),
            ),
          )
          .limit(1)
          .for("update")
      )[0];
      if (current)
        throw new ApiError(
          409,
          "active_membership_exists",
          "Student already has one active merchant membership",
        );
      await tx.insert(memberships).values({
        id: id("membership"),
        studentId: application.studentId,
        merchantId,
        isActive: true,
        approvedAt: now,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const user = (
        await tx
          .select()
          .from(users)
          .where(eq(users.id, application.studentId))
          .limit(1)
          .for("update")
      )[0];
      const roles = [...new Set([...JSON.parse(user.rolesJson), Role.SHIPPER])];
      await tx
        .update(users)
        .set({ rolesJson: JSON.stringify(roles), updatedAt: now })
        .where(eq(users.id, application.studentId));
    }
    const [updated] = await tx
      .update(applications)
      .set({
        status: decision,
        reviewedByUserId: actorId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.status, "PENDING"),
        ),
      )
      .returning();
    await tx.insert(auditEvents).values({
      id: id("audit"),
      actorUserId: actorId,
      merchantId,
      tripId: null,
      eventType: `APPLICATION_${decision}`,
      payloadJson: JSON.stringify({ applicationId }),
      createdAt: now,
    });
    return updated;
  });
}

type ActionResult = { status: number; data: unknown };
async function idempotent(
  db: AppDb,
  actor: Actor,
  request: FastifyRequest,
  action: string,
  body: unknown,
  run: () => Promise<ActionResult>,
): Promise<ActionResult> {
  const key = request.headers["idempotency-key"];
  if (typeof key !== "string" || key.length < 8 || key.length > 128)
    throw new ApiError(
      400,
      "idempotency_key_required",
      "Idempotency-Key header (8-128 characters) is required",
    );
  const requestHash = createHash("sha256")
    .update(JSON.stringify(body ?? {}))
    .digest("hex");
  const prior = (
    await db
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.actorUserId, actor.id),
          eq(idempotencyRecords.action, action),
          eq(idempotencyRecords.key, key),
        ),
      )
      .limit(1)
  )[0];
  if (prior) {
    if (prior.requestHash !== requestHash)
      throw new ApiError(
        409,
        "idempotency_conflict",
        "Idempotency key was already used with a different request",
      );
    if (!prior.responseJson)
      throw new ApiError(
        409,
        "request_in_progress",
        "An identical request is still in progress",
      );
    return { status: prior.statusCode, data: JSON.parse(prior.responseJson) };
  }
  const reservationId = id("idem");
  const inserted = await db
    .insert(idempotencyRecords)
    .values({
      id: reservationId,
      actorUserId: actor.id,
      action,
      key,
      requestHash,
      responseJson: "",
      statusCode: 102,
      createdAt: nowIso(),
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyRecords.id });
  if (!inserted.length)
    throw new ApiError(
      409,
      "request_in_progress",
      "An identical request is still in progress",
    );
  try {
    const result = await run();
    await db
      .update(idempotencyRecords)
      .set({
        responseJson: JSON.stringify(result.data),
        statusCode: result.status,
      })
      .where(eq(idempotencyRecords.id, reservationId));
    return result;
  } catch (error) {
    await db
      .delete(idempotencyRecords)
      .where(eq(idempotencyRecords.id, reservationId));
    throw error;
  }
}

export function registerRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: Config & { jwtSecret: string },
) {
  app.get("/health", async () => ({ status: "ok", service: "dormitory-api" }));
  app.get("/api/v1/auth/demo-accounts", async () =>
    envelope([
      {
        persona: "ADMIN",
        email: "admin@demo.local",
        roles: ["ADMIN"],
      },
      {
        persona: "STUDENT",
        email: "student@demo.local",
        roles: ["STUDENT"],
      },
      {
        persona: "MERCHANT",
        email: "merchant@demo.local",
        roles: ["MERCHANT"],
      },
      {
        persona: "PENDING_MERCHANT",
        email: "pending-merchant@demo.local",
        roles: ["MERCHANT"],
      },
      {
        persona: "SHIPPER",
        email: "shipper@demo.local",
        roles: ["STUDENT", "SHIPPER"],
      },
    ]),
  );
  app.post(
    "/api/v1/auth/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = parseBody(
        z.object({ email: z.string().email(), password: z.string().min(6) }),
        request,
      );
      const user = (
        await db
          .select()
          .from(users)
          .where(eq(users.email, body.email.toLowerCase()))
          .limit(1)
      )[0];
      if (!user || !verifyPassword(body.password, user.passwordHash))
        throw new ApiError(
          401,
          "invalid_credentials",
          "Email or password is incorrect",
        );
      const token = await signAccessToken(
          user.id,
          config.jwtSecret,
          config.jwtExpiresSeconds,
        ),
        now = nowIso(),
        expires = new Date(
          Date.now() + config.jwtExpiresSeconds * 1000,
        ).toISOString();
      await db.insert(sessions).values({
        id: id("session"),
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: expires,
        createdAt: now,
      });
      return reply
        .setCookie(AUTH_COOKIE, token, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: config.cookieSecure,
          maxAge: config.jwtExpiresSeconds,
        })
        .send(
          envelope({
            ...(request.headers["x-auth-transport"] === "bearer"
              ? { token }
              : {}),
            session: { expires_at: expires },
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              roles: JSON.parse(user.rolesJson),
              building_id: user.buildingId,
              ...(await identityContext(db, user.id)),
            },
          }),
        );
    },
  );
  app.get("/api/v1/auth/me", async (request) => {
    const actor = await authenticate(db, request);
    return envelope({ ...actor, ...(await identityContext(db, actor.id)) });
  });
  app.post("/api/v1/auth/logout", async (request, reply) => {
    const actor = await authenticate(db, request),
      token = requestAccessToken(request)!;
    await db
      .delete(sessions)
      .where(
        and(
          eq(sessions.userId, actor.id),
          eq(sessions.tokenHash, hashToken(token)),
        ),
      );
    return reply
      .clearCookie(AUTH_COOKIE, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: config.cookieSecure,
      })
      .code(204)
      .send();
  });

  app.get("/api/v1/buildings", async () =>
    envelope(await db.select().from(buildings).orderBy(asc(buildings.code))),
  );
  app.get("/api/v1/campus/route-segments", async () => envelope(campusRoutePayload()));
  app.get("/api/v1/campus/layout", async () => envelope(campusLayoutPayload()));
  app.get("/api/v1/merchants", async () =>
    envelope(
      await db.select().from(merchants).where(eq(merchants.status, "APPROVED")),
    ),
  );
  app.get("/api/v1/merchants/:merchantId/products", async (request) => {
    const merchantId = param(request, "merchantId");
    const approved = (
      await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(
          and(eq(merchants.id, merchantId), eq(merchants.status, "APPROVED")),
        )
        .limit(1)
    )[0];
    if (!approved) throw new ApiError(404, "not_found", "Merchant not found");
    return envelope(
      await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.merchantId, merchantId),
            eq(products.isAvailable, true),
          ),
        ),
    );
  });

  app.get("/api/v1/student/orders", async (request) => {
    const actor = await authenticate(db, request);
    requireRole(actor, Role.STUDENT);
    return envelope(
      await db
        .select()
        .from(orders)
        .where(eq(orders.studentId, actor.id))
        .orderBy(desc(orders.createdAt)),
    );
  });
  app.post("/api/v1/student/orders", async (request, reply) => {
    const actor = await authenticate(db, request);
    requireRole(actor, Role.STUDENT);
    const body = parseBody(z.object({ product_id: z.string().min(1) }), request);
    if (!actor.buildingId)
      throw new ApiError(
        409,
        "student_building_required",
        "A dormitory building is required before placing an order",
      );
    const result = await idempotent(
      db,
      actor,
      request,
      "student-order:create",
      body,
      async () => {
        const product = (
          await db
            .select()
            .from(products)
            .where(eq(products.id, body.product_id))
            .limit(1)
        )[0];
        if (!product || !product.isAvailable)
          throw new ApiError(404, "product_unavailable", "Product is unavailable");
        const merchant = (
          await db
            .select()
            .from(merchants)
            .where(eq(merchants.id, product.merchantId))
            .limit(1)
        )[0];
        if (!merchant || merchant.status !== "APPROVED")
          throw new ApiError(
            409,
            "merchant_unavailable",
            "This merchant is not accepting orders",
          );
        const now = nowIso();
        const order = {
          id: id("order"),
          studentId: actor.id,
          merchantId: product.merchantId,
          buildingId: actor.buildingId!,
          productId: product.id,
          status: OrderStatus.CREATED,
          readyAt: null,
          deliveryAttempt: 1,
          tripId: null,
          stopId: null,
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(orders).values(order);
        await audit(db, "ORDER_CREATED", actor.id, product.merchantId, null, {
          orderId: order.id,
          productId: product.id,
        });
        return { status: 201, data: order };
      },
    );
    return reply
      .code(result.status)
      .header(
        "Location",
        `/api/v1/student/orders/${(result.data as { id: string }).id}`,
      )
      .send(envelope(result.data));
  });
  app.get("/api/v1/student/notifications", async (request) => {
    const actor = await authenticate(db, request);
    const { page, perPage } = queryPage(request);
    return paginate(
      await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, actor.id))
        .orderBy(desc(notifications.createdAt)),
      page,
      perPage,
    );
  });
  app.post(
    "/api/v1/student/orders/:orderId/ready-for-redelivery",
    async (request, reply) => {
      const actor = await authenticate(db, request);
      requireRole(actor, Role.STUDENT);
      const result = await idempotent(
        db,
        actor,
        request,
        `order:${param(request, "orderId")}:ready`,
        {},
        async () => {
          const order = (
            await db
              .select()
              .from(orders)
              .where(
                and(
                  eq(orders.id, param(request, "orderId")),
                  eq(orders.studentId, actor.id),
                ),
              )
              .limit(1)
          )[0];
          if (!order) throw new ApiError(404, "not_found", "Order not found");
          if (order.status === OrderStatus.TEMP_WAITING_READY)
            return { status: 200, data: order };
          if (order.status !== OrderStatus.TEMP_WAITING)
            throw new ApiError(
              409,
              "invalid_order_state",
              "Only TEMP_WAITING can become ready for redelivery",
            );
          const [updated] = await db
            .update(orders)
            .set({
              status: OrderStatus.TEMP_WAITING_READY,
              updatedAt: nowIso(),
            })
            .where(eq(orders.id, order.id))
            .returning();
          await audit(
            db,
            "ORDER_TEMP_WAITING_READY",
            actor.id,
            order.merchantId,
            order.tripId,
            { orderId: order.id },
          );
          return { status: 200, data: updated };
        },
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );

  const applicationBody = z.object({
    merchant_id: z.string().min(1),
    vehicle_type: z.string().min(2).max(50),
    availability: z.string().min(2).max(250),
    experience: z.string().min(2).max(500),
    note: z.string().max(500).optional(),
  });
  app.post("/api/v1/student/shipper-applications", async (request, reply) => {
    const actor = await authenticate(db, request);
    requireRole(actor, Role.STUDENT);
    const body = parseBody(applicationBody, request);
    const result = await idempotent(
      db,
      actor,
      request,
      "shipper-application:create",
      body,
      async () => {
        const merchant = (
          await db
            .select()
            .from(merchants)
            .where(eq(merchants.id, body.merchant_id))
            .limit(1)
        )[0];
        if (!merchant)
          throw new ApiError(404, "not_found", "Merchant not found");
        if (merchant.status !== "APPROVED")
          throw new ApiError(
            403,
            "merchant_not_approved",
            "Merchant approval is required before accepting applications",
          );
        const existing = (
          await db
            .select()
            .from(applications)
            .where(
              and(
                eq(applications.studentId, actor.id),
                eq(applications.merchantId, body.merchant_id),
                eq(applications.status, "PENDING"),
              ),
            )
            .limit(1)
        )[0];
        if (existing)
          throw new ApiError(
            409,
            "application_exists",
            "A pending application already exists",
          );
        const now = nowIso(),
          application = {
            id: id("application"),
            studentId: actor.id,
            merchantId: body.merchant_id,
            vehicleType: body.vehicle_type,
            availability: body.availability,
            experience: body.experience,
            note: body.note ?? null,
            status: "PENDING",
            reviewedByUserId: null,
            reviewedAt: null,
            createdAt: now,
            updatedAt: now,
          };
        await db.insert(applications).values(application);
        await audit(
          db,
          "APPLICATION_SUBMITTED",
          actor.id,
          body.merchant_id,
          null,
          { applicationId: application.id },
        );
        return { status: 201, data: application };
      },
    );
    return reply
      .code(result.status)
      .header(
        "Location",
        `/api/v1/student/shipper-applications/${(result.data as { id: string }).id}`,
      )
      .send(envelope(result.data));
  });
  app.get("/api/v1/student/shipper-applications", async (request) => {
    const actor = await authenticate(db, request);
    requireRole(actor, Role.STUDENT);
    return envelope(
      await db
        .select()
        .from(applications)
        .where(eq(applications.studentId, actor.id))
        .orderBy(desc(applications.createdAt)),
    );
  });

  app.get("/api/v1/merchant/orders", async (request) => {
    const actor = await authenticate(db, request),
      merchant = await merchantOwnedBy(db, actor);
    const q = request.query as Record<string, string>;
    const conditions = [eq(orders.merchantId, merchant.id)];
    if (q.status) conditions.push(eq(orders.status, q.status));
    const { page, perPage } = queryPage(request);
    return paginate(
      await db
        .select()
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt)),
      page,
      perPage,
    );
  });
  app.patch(
    "/api/v1/merchant/orders/:orderId/status",
    async (request, reply) => {
      const actor = await authenticate(db, request),
        merchant = await merchantOwnedBy(db, actor);
      const body = parseBody(
        z.object({
          status: z.enum(["CONFIRMED", "PREPARING", "READY", "CANCELLED"]),
        }),
        request,
      );
      const result = await idempotent(
        db,
        actor,
        request,
        `order:${param(request, "orderId")}:status`,
        body,
        async () => {
          const order = (
            await db
              .select()
              .from(orders)
              .where(
                and(
                  eq(orders.id, param(request, "orderId")),
                  eq(orders.merchantId, merchant.id),
                ),
              )
              .limit(1)
          )[0];
          if (!order) throw new ApiError(404, "not_found", "Order not found");
          if (order.status === body.status) return { status: 200, data: order };
          if (order.tripId)
            throw new ApiError(
              409,
              "active_trip_read_only",
              "Active-trip orders are immutable to merchants",
            );
          if (body.status === "CANCELLED") {
            if (
              !["CREATED", "CONFIRMED", "PREPARING", "READY"].includes(
                order.status,
              )
            )
              throw new ApiError(
                409,
                "invalid_order_transition",
                "Order cannot be cancelled now",
              );
          } else if (restaurantTransitions[order.status] !== body.status)
            throw new ApiError(
              409,
              "invalid_order_transition",
              `Expected ${restaurantTransitions[order.status] ?? "terminal"} after ${order.status}`,
            );
          const [updated] = await db
            .update(orders)
            .set({
              status: body.status,
              readyAt: body.status === "READY" ? nowIso() : order.readyAt,
              updatedAt: nowIso(),
            })
            .where(eq(orders.id, order.id))
            .returning();
          if (body.status === "READY")
            await audit(db, "ORDER_BECAME_READY", actor.id, merchant.id, null, {
              orderId: order.id,
            });
          return { status: 200, data: updated };
        },
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );
  app.get("/api/v1/merchant/shipper-applications", async (request) => {
    const actor = await authenticate(db, request),
      merchant = await merchantOwnedBy(db, actor);
    return envelope(
      await db
        .select()
        .from(applications)
        .where(eq(applications.merchantId, merchant.id))
        .orderBy(desc(applications.createdAt)),
    );
  });
  app.post(
    "/api/v1/merchant/shipper-applications/:applicationId/review",
    async (request, reply) => {
      const actor = await authenticate(db, request),
        merchant = await merchantOwnedBy(db, actor);
      const body = parseBody(
        z.object({ decision: z.enum(["APPROVED", "REJECTED"]) }),
        request,
      );
      const result = await idempotent(
        db,
        actor,
        request,
        `application:${param(request, "applicationId")}:review`,
        body,
        async () => ({
          status: 200,
          data: await reviewApplicationAtomic(
            db,
            param(request, "applicationId"),
            merchant.id,
            actor.id,
            body.decision,
          ),
        }),
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );
  app.get("/api/v1/merchant/shipper-memberships", async (request) => {
    const actor = await authenticate(db, request),
      merchant = await merchantOwnedBy(db, actor);
    return envelope(
      await db
        .select()
        .from(memberships)
        .where(eq(memberships.merchantId, merchant.id)),
    );
  });
  app.post(
    "/api/v1/merchant/shipper-memberships/:membershipId/deactivate",
    async (request, reply) => {
      const actor = await authenticate(db, request),
        merchant = await merchantOwnedBy(db, actor);
      const result = await idempotent(
        db,
        actor,
        request,
        `membership:${param(request, "membershipId")}:deactivate`,
        {},
        async () => {
          const member = (
            await db
              .select()
              .from(memberships)
              .where(
                and(
                  eq(memberships.id, param(request, "membershipId")),
                  eq(memberships.merchantId, merchant.id),
                ),
              )
              .limit(1)
          )[0];
          if (!member)
            throw new ApiError(404, "not_found", "Membership not found");
          if (!member.isActive) return { status: 200, data: member };
          const activeTrip = (
            await db
              .select()
              .from(trips)
              .where(
                and(
                  eq(trips.shipperStudentId, member.studentId),
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
          if (activeTrip)
            throw new ApiError(
              409,
              "active_trip_exists",
              "Cannot deactivate membership during an active trip",
            );
          const [updated] = await db
            .update(memberships)
            .set({
              isActive: false,
              deactivatedAt: nowIso(),
              updatedAt: nowIso(),
            })
            .where(eq(memberships.id, member.id))
            .returning();
          return { status: 200, data: updated };
        },
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );

  app.post("/api/v1/shipper/trips/ready", async (request, reply) => {
    const actor = await authenticate(db, request);
    requireRole(actor, Role.SHIPPER);
    const body = z
      .object({
        start_location: z
          .object({
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
            recorded_at: z.string().datetime({ offset: true }),
            source: z.literal("DEMO_GATE"),
          })
          .optional(),
      })
      .parse(request.body ?? {});
    const result = await idempotent(
      db,
      actor,
      request,
      "trip:ready",
      body,
      async () => ({
        status: 201,
        data: await createTrip(
          db,
          config,
          actor,
          body.start_location
            ? {
                latitude: body.start_location.latitude,
                longitude: body.start_location.longitude,
                recordedAt: body.start_location.recorded_at,
                source: body.start_location.source,
              }
            : undefined,
        ),
      }),
    );
    return reply
      .code(result.status)
      .header(
        "Location",
        `/api/v1/trips/${(result.data as { tripId: string }).tripId}`,
      )
      .send(envelope(result.data));
  });
  app.get("/api/v1/shipper/orders/eligible", async (request) => {
    const actor = await authenticate(db, request);
    requireRole(actor, Role.SHIPPER);
    const membership = await activeMembership(db, actor);
    return envelope(
      await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.merchantId, membership.merchantId),
            eq(orders.status, OrderStatus.READY),
            isNull(orders.tripId),
          ),
        )
        .orderBy(asc(orders.readyAt)),
    );
  });
  app.get("/api/v1/shipper/trips/active", async (request) => {
    const actor = await authenticate(db, request);
    requireRole(actor, Role.SHIPPER);
    await activeMembership(db, actor);
    const trip = (
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
        .orderBy(desc(trips.createdAt))
        .limit(1)
    )[0];
    return envelope(
      trip ? tripProjection(actor, await tripView(db, trip.id)) : null,
    );
  });
  app.get("/api/v1/trips/active", async (request) => {
    const actor = await authenticate(db, request);
    const activeStatuses = [
      "DRAFT_GENERATING",
      "AWAITING_SHIPPER_CONFIRMATION",
      "STARTING",
      "IN_PROGRESS",
      "REDELIVERY",
    ];
    let trip;
    if (actor.roles.includes(Role.SHIPPER))
      trip = (
        await db
          .select()
          .from(trips)
          .where(
            and(
              eq(trips.shipperStudentId, actor.id),
              inArray(trips.status, activeStatuses),
            ),
          )
          .orderBy(desc(trips.createdAt))
          .limit(1)
      )[0];
    else if (actor.roles.includes(Role.MERCHANT)) {
      const merchant = await merchantOwnedBy(db, actor);
      trip = (
        await db
          .select()
          .from(trips)
          .where(
            and(
              eq(trips.merchantId, merchant.id),
              inArray(trips.status, activeStatuses),
            ),
          )
          .orderBy(desc(trips.createdAt))
          .limit(1)
      )[0];
    } else {
      const own = (
        await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.studentId, actor.id),
              inArray(orders.status, [
                "ASSIGNED_TO_TRIP",
                "NOTIFIED_TO_COME_DOWN",
                "TEMP_WAITING",
                "TEMP_WAITING_READY",
                "REDELIVERY_NEXT",
              ]),
            ),
          )
          .orderBy(desc(orders.updatedAt))
          .limit(1)
      )[0];
      if (own?.tripId)
        trip = (
          await db.select().from(trips).where(eq(trips.id, own.tripId)).limit(1)
        )[0];
    }
    return envelope(trip ? tripProjection(actor, await tripView(db, trip.id)) : null);
  });
  app.get("/api/v1/student/trips/:tripId", async (request) => {
    const actor = await authenticate(db, request);
    requireRole(actor, Role.STUDENT);
    await canViewTrip(db, actor, param(request, "tripId"));
    return envelope(
      studentTripProjection(actor, await tripView(db, param(request, "tripId"))),
    );
  });
  app.get("/api/v1/trips/:tripId", async (request) => {
    const actor = await authenticate(db, request);
    await canViewTrip(db, actor, param(request, "tripId"));
    return envelope(
      tripProjection(actor, await tripView(db, param(request, "tripId"))),
    );
  });
  app.get("/api/v1/merchant/trips", async (request) => {
    const actor = await authenticate(db, request),
      merchant = await merchantOwnedBy(db, actor);
    return envelope(
      await db
        .select()
        .from(trips)
        .where(eq(trips.merchantId, merchant.id))
        .orderBy(desc(trips.createdAt)),
    );
  });

  app.get("/api/v1/admin/merchants", async (request) => {
    const actor = await authenticate(db, request);
    requireRole(actor, Role.ADMIN);
    const rows = await db
      .select()
      .from(merchants)
      .orderBy(desc(merchants.createdAt));
    return envelope(
      await Promise.all(
        rows.map(async (merchant) => {
          const owner = (
            await db
              .select()
              .from(users)
              .where(eq(users.id, merchant.ownerUserId))
              .limit(1)
          )[0];
          return {
            ...merchant,
            ownerName: owner?.name ?? "Unknown owner",
            ownerEmail: owner?.email ?? "",
          };
        }),
      ),
    );
  });
  app.patch(
    "/api/v1/admin/merchants/:merchantId/status",
    async (request, reply) => {
      const actor = await authenticate(db, request);
      requireRole(actor, Role.ADMIN);
      const body = parseBody(
        z.object({ status: z.enum(["APPROVED", "REJECTED"]) }),
        request,
      );
      const result = await idempotent(
        db,
        actor,
        request,
        `admin:merchant:${param(request, "merchantId")}:status`,
        body,
        async () =>
          db.transaction(async (tx) => {
            const merchant = (
              await tx
                .select()
                .from(merchants)
                .where(eq(merchants.id, param(request, "merchantId")))
                .limit(1)
                .for("update")
            )[0];
            if (!merchant)
              throw new ApiError(404, "not_found", "Merchant not found");
            if (merchant.status === body.status)
              return { status: 200, data: merchant };
            const now = nowIso();
            const [updated] = await tx
              .update(merchants)
              .set({
                status: body.status,
                reviewedByUserId: actor.id,
                reviewedAt: now,
                updatedAt: now,
              })
              .where(eq(merchants.id, merchant.id))
              .returning();
            await tx.insert(auditEvents).values({
              id: id("audit"),
              actorUserId: actor.id,
              merchantId: merchant.id,
              tripId: null,
              eventType: `MERCHANT_${body.status}`,
              payloadJson: JSON.stringify({
                merchantId: merchant.id,
                previousStatus: merchant.status,
              }),
              createdAt: now,
            });
            return { status: 200, data: updated };
          }),
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );
  app.get("/api/v1/admin/trips", async (request) => {
    const actor = await authenticate(db, request);
    requireRole(actor, Role.ADMIN);
    const q = request.query as Record<string, string>;
    const activeStatuses = [
      "DRAFT_GENERATING",
      "AWAITING_SHIPPER_CONFIRMATION",
      "STARTING",
      "IN_PROGRESS",
      "REDELIVERY",
    ];
    const rows =
      q.status === "active"
        ? await db
            .select()
            .from(trips)
            .where(inArray(trips.status, activeStatuses))
            .orderBy(desc(trips.createdAt))
        : await db.select().from(trips).orderBy(desc(trips.createdAt));
    return envelope(await Promise.all(rows.map((row) => tripView(db, row.id))));
  });

  app.post(
    "/api/v1/route-recommendations/:recommendationId/confirm",
    async (request, reply) => {
      const actor = await authenticate(db, request);
      const rec = (
        await db
          .select()
          .from(recommendations)
          .where(eq(recommendations.id, param(request, "recommendationId")))
          .limit(1)
      )[0];
      if (!rec)
        throw new ApiError(404, "not_found", "Recommendation not found");
      const trip = await assertAssignedShipper(db, actor, rec.tripId);
      const result = await idempotent(
        db,
        actor,
        request,
        `route:${rec.id}:confirm`,
        {},
        async () => {
          if (rec.status === RecommendationStatus.CONFIRMED)
            return { status: 200, data: rec };
          if (rec.status !== RecommendationStatus.PROPOSED)
            throw new ApiError(
              409,
              "invalid_recommendation_state",
              "Only a proposed route can be confirmed",
            );
          const ends = new Date(
            Date.now() + config.countdownSeconds * 1000,
          ).toISOString();
          const [updated] = await db
            .update(recommendations)
            .set({
              status: RecommendationStatus.CONFIRMED,
              confirmedAt: nowIso(),
            })
            .where(eq(recommendations.id, rec.id))
            .returning();
          await db
            .update(trips)
            .set({
              status:
                rec.recommendationType === "RECALCULATION"
                  ? trip.status
                  : TripStatus.STARTING,
              countdownEndsAt: ends,
              updatedAt: nowIso(),
            })
            .where(eq(trips.id, trip.id));
          await audit(
            db,
            "COUNTDOWN_STARTED",
            actor.id,
            trip.merchantId,
            trip.id,
            { recommendationId: rec.id, endsAt: ends },
          );
          return { status: 200, data: { ...updated, countdown_ends_at: ends } };
        },
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );
  app.post(
    "/api/v1/route-recommendations/:recommendationId/reject",
    async (request, reply) => {
      const actor = await authenticate(db, request);
      const rec = (
        await db
          .select()
          .from(recommendations)
          .where(eq(recommendations.id, param(request, "recommendationId")))
          .limit(1)
      )[0];
      if (!rec)
        throw new ApiError(404, "not_found", "Recommendation not found");
      const trip = await assertAssignedShipper(db, actor, rec.tripId);
      const result = await idempotent(
        db,
        actor,
        request,
        `route:${rec.id}:reject`,
        {},
        async () => {
          if (rec.status === RecommendationStatus.REJECTED)
            return { status: 200, data: rec };
          if (rec.status !== RecommendationStatus.PROPOSED)
            throw new ApiError(
              409,
              "invalid_recommendation_state",
              "Only a proposed route can be rejected",
            );
          const [updated] = await db
            .update(recommendations)
            .set({ status: RecommendationStatus.REJECTED })
            .where(eq(recommendations.id, rec.id))
            .returning();
          if (rec.recommendationType === "INITIAL") {
            await db
              .update(orders)
              .set({
                status: OrderStatus.READY,
                tripId: null,
                stopId: null,
                updatedAt: nowIso(),
              })
              .where(
                and(
                  eq(orders.tripId, trip.id),
                  eq(orders.status, OrderStatus.ASSIGNED_TO_TRIP),
                ),
              );
            await db
              .update(trips)
              .set({
                status: TripStatus.CANCELLED_BEFORE_START,
                currentStopId: null,
                updatedAt: nowIso(),
              })
              .where(eq(trips.id, trip.id));
            await db
              .update(mockLocations)
              .set({ playbackStatus: "STOPPED" })
              .where(eq(mockLocations.tripId, trip.id));
          } else if (rec.recommendationType === "REDELIVERY") {
            const retryStops = await db
              .select()
              .from(stops)
              .where(
                and(
                  eq(stops.tripId, trip.id),
                  eq(stops.passType, "REDELIVERY"),
                ),
              );
            if (retryStops.length)
              await db
                .update(orders)
                .set({ stopId: null, updatedAt: nowIso() })
                .where(
                  and(
                    eq(orders.tripId, trip.id),
                    inArray(
                      orders.stopId,
                      retryStops.map((s) => s.id),
                    ),
                  ),
                );
            await db
              .delete(stops)
              .where(
                and(
                  eq(stops.tripId, trip.id),
                  eq(stops.passType, "REDELIVERY"),
                ),
              );
          }
          await audit(
            db,
            "ROUTE_REJECTED",
            actor.id,
            trip.merchantId,
            trip.id,
            { recommendationId: rec.id, type: rec.recommendationType },
          );
          return { status: 200, data: updated };
        },
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );
  app.post(
    "/api/v1/route-recommendations/:recommendationId/cancel-countdown",
    async (request, reply) => {
      const actor = await authenticate(db, request);
      const rec = (
        await db
          .select()
          .from(recommendations)
          .where(eq(recommendations.id, param(request, "recommendationId")))
          .limit(1)
      )[0];
      if (!rec)
        throw new ApiError(404, "not_found", "Recommendation not found");
      const trip = await assertAssignedShipper(db, actor, rec.tripId);
      const result = await idempotent(
        db,
        actor,
        request,
        `route:${rec.id}:cancel`,
        {},
        async () => {
          if (rec.status === RecommendationStatus.CANCELLED)
            return { status: 200, data: rec };
          if (rec.status !== RecommendationStatus.CONFIRMED)
            throw new ApiError(
              409,
              "invalid_recommendation_state",
              "No active countdown",
            );
          const [updated] = await db
            .update(recommendations)
            .set({ status: RecommendationStatus.CANCELLED })
            .where(eq(recommendations.id, rec.id))
            .returning();
          await db
            .update(trips)
            .set({
              status:
                rec.recommendationType === "INITIAL"
                  ? TripStatus.AWAITING_SHIPPER_CONFIRMATION
                  : trip.status,
              countdownEndsAt: null,
              updatedAt: nowIso(),
            })
            .where(eq(trips.id, trip.id));
          await audit(
            db,
            "COUNTDOWN_CANCELLED",
            actor.id,
            trip.merchantId,
            trip.id,
            { recommendationId: rec.id },
          );
          return { status: 200, data: updated };
        },
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );
  app.post(
    "/api/v1/route-recommendations/:recommendationId/activate",
    async (request, reply) => {
      const actor = await authenticate(db, request);
      const rec = (
        await db
          .select()
          .from(recommendations)
          .where(eq(recommendations.id, param(request, "recommendationId")))
          .limit(1)
      )[0];
      if (!rec)
        throw new ApiError(404, "not_found", "Recommendation not found");
      const trip = await assertAssignedShipper(db, actor, rec.tripId);
      const result = await idempotent(
        db,
        actor,
        request,
        `route:${rec.id}:activate`,
        {},
        async () => {
          await activateRecommendation(db, rec.id, actor.id);
          return { status: 200, data: await tripView(db, trip.id) };
        },
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );

  app.post("/api/v1/trips/:tripId/recalculate", async (request, reply) => {
    const actor = await authenticate(db, request),
      trip = await assertAssignedShipper(db, actor, param(request, "tripId"));
    if (
      ![TripStatus.IN_PROGRESS, TripStatus.REDELIVERY].includes(
        trip.status as any,
      )
    )
      throw new ApiError(409, "invalid_trip_state", "Trip must be active");
    const result = await idempotent(
      db,
      actor,
      request,
      `trip:${trip.id}:recalculate`,
      {},
      async () => ({
        status: 201,
        data: await generateRecommendation(
          db,
          config,
          trip.id,
          "RECALCULATION",
          actor.id,
        ),
      }),
    );
    return reply.code(result.status).send(envelope(result.data));
  });
  app.post(
    "/api/v1/trips/:tripId/redelivery-recommendations",
    async (request, reply) => {
      const actor = await authenticate(db, request),
        trip = await assertAssignedShipper(db, actor, param(request, "tripId"));
      const primary = await db
        .select()
        .from(stops)
        .where(and(eq(stops.tripId, trip.id), eq(stops.passType, "PRIMARY")));
      if (primary.some((s) => s.status !== "COMPLETED"))
        throw new ApiError(
          409,
          "primary_route_incomplete",
          "All primary stops must complete first",
        );
      const eligible = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.tripId, trip.id),
            eq(orders.status, OrderStatus.TEMP_WAITING_READY),
          ),
        );
      if (!eligible.length)
        throw new ApiError(
          409,
          "no_redelivery_orders",
          "No ready redelivery orders",
        );
      const result = await idempotent(
        db,
        actor,
        request,
        `trip:${trip.id}:redelivery`,
        {},
        async () => {
          const now = nowIso(),
            groups = [...new Set(eligible.map((o) => o.buildingId))];
          for (let i = 0; i < groups.length; i++) {
            const stopId = id("stop");
            await db.insert(stops).values({
              id: stopId,
              tripId: trip.id,
              buildingId: groups[i],
              sequence: i + 1,
              passType: "REDELIVERY",
              status: "RETRY_WAITING",
              temporarilyUnavailable: false,
              arrivedAt: null,
              minimumWaitEndsAt: null,
              completedAt: null,
              createdAt: now,
              updatedAt: now,
            });
            await db
              .update(orders)
              .set({ stopId, updatedAt: now })
              .where(
                and(
                  eq(orders.tripId, trip.id),
                  eq(orders.buildingId, groups[i]),
                  eq(orders.status, OrderStatus.TEMP_WAITING_READY),
                ),
              );
          }
          return {
            status: 201,
            data: await generateRecommendation(
              db,
              config,
              trip.id,
              "REDELIVERY",
              actor.id,
            ),
          };
        },
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );

  app.post("/api/v1/stops/:stopId/announce", async (request, reply) => {
    const actor = await authenticate(db, request);
    const stop = (
      await db
        .select()
        .from(stops)
        .where(eq(stops.id, param(request, "stopId")))
        .limit(1)
    )[0];
    if (!stop) throw new ApiError(404, "not_found", "Stop not found");
    const trip = await assertAssignedShipper(db, actor, stop.tripId);
    if (!["NEXT", "RETRY_NEXT"].includes(stop.status))
      throw new ApiError(
        409,
        "invalid_stop_state",
        "Only next stop can be announced",
      );
    const result = await idempotent(
      db,
      actor,
      request,
      `stop:${stop.id}:announce`,
      {},
      async () => {
        if (stop.announcedAt) return { status: 200, data: stop };
        const announcedAt = nowIso();
        const [announcedStop] = await db
          .update(stops)
          .set({ announcedAt, updatedAt: announcedAt })
          .where(eq(stops.id, stop.id))
          .returning();
        if (stop.passType === "PRIMARY")
          await db
            .update(orders)
            .set({ status: OrderStatus.NOTIFIED_TO_COME_DOWN, updatedAt: announcedAt })
            .where(
              and(
                eq(orders.tripId, trip.id),
                eq(orders.stopId, stop.id),
                eq(orders.status, OrderStatus.ASSIGNED_TO_TRIP),
              ),
            );
        for (const order of await db
          .select()
          .from(orders)
          .where(and(eq(orders.tripId, trip.id), eq(orders.stopId, stop.id))))
          await notify(
            db,
            order.studentId,
            trip.id,
            stop.id,
            "PRE_ARRIVAL",
            "The shipper is heading to your building. Live tracking is now available.",
            `${trip.id}:${stop.id}:${order.studentId}:pre-arrival`,
          );
        await audit(db, "STOP_ANNOUNCED", actor.id, trip.merchantId, trip.id, {
          stopId: stop.id,
        });
        return { status: 200, data: announcedStop };
      },
    );
    return reply.code(result.status).send(envelope(result.data));
  });
  app.post("/api/v1/stops/:stopId/arrive", async (request, reply) => {
    const actor = await authenticate(db, request);
    const stop = (
      await db
        .select()
        .from(stops)
        .where(eq(stops.id, param(request, "stopId")))
        .limit(1)
    )[0];
    if (!stop) throw new ApiError(404, "not_found", "Stop not found");
    const trip = await assertAssignedShipper(db, actor, stop.tripId);
    if (!stop.announcedAt)
      throw new ApiError(
        409,
        "stop_not_announced",
        "Announce that you are heading to this building before marking arrival",
      );
    const target = stop.passType === "PRIMARY" ? "ARRIVED" : "RETRY_ARRIVED";
    const result = await idempotent(
      db,
      actor,
      request,
      `stop:${stop.id}:arrive`,
      {},
      async () => {
        if (stop.status === target) return { status: 200, data: stop };
        if (!["NEXT", "RETRY_NEXT"].includes(stop.status))
          throw new ApiError(
            409,
            "invalid_stop_state",
            "Only next stop can be arrived",
          );
        const now = nowIso(),
          ends = new Date(Date.now() + config.waitSeconds * 1000).toISOString();
        const [updated] = await db
          .update(stops)
          .set({
            status: target,
            arrivedAt: now,
            minimumWaitEndsAt: ends,
            updatedAt: now,
          })
          .where(eq(stops.id, stop.id))
          .returning();
        await db
          .update(trips)
          .set({ currentStopId: stop.id, updatedAt: now })
          .where(eq(trips.id, trip.id));
        for (const order of await db
          .select()
          .from(orders)
          .where(eq(orders.stopId, stop.id)))
          await notify(
            db,
            order.studentId,
            trip.id,
            stop.id,
            "ARRIVAL",
            "The shipper has arrived at your building.",
            `${trip.id}:${stop.id}:${order.studentId}:arrival`,
          );
        await audit(db, "STOP_ARRIVED", actor.id, trip.merchantId, trip.id, {
          stopId: stop.id,
          minimumWaitEndsAt: ends,
        });
        return { status: 200, data: updated };
      },
    );
    return reply.code(result.status).send(envelope(result.data));
  });
  app.post(
    "/api/v1/stops/:stopId/temporarily-unavailable",
    async (request, reply) => {
      const actor = await authenticate(db, request);
      const stop = (
        await db
          .select()
          .from(stops)
          .where(eq(stops.id, param(request, "stopId")))
          .limit(1)
      )[0];
      if (!stop) throw new ApiError(404, "not_found", "Stop not found");
      await assertAssignedShipper(db, actor, stop.tripId);
      if (stop.passType !== "PRIMARY" || stop.status !== "WAITING")
        throw new ApiError(
          409,
          "invalid_stop_state",
          "Only an unvisited remaining primary stop may be unavailable",
        );
      const result = await idempotent(
        db,
        actor,
        request,
        `stop:${stop.id}:unavailable`,
        {},
        async () => {
          const [updated] = await db
            .update(stops)
            .set({ temporarilyUnavailable: true, updatedAt: nowIso() })
            .where(eq(stops.id, stop.id))
            .returning();
          return { status: 200, data: updated };
        },
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );

  app.post("/api/v1/orders/:orderId/outcome", async (request, reply) => {
    const actor = await authenticate(db, request);
    const body = parseBody(
      z.object({
        outcome: z.enum(["DELIVERED", "TEMP_WAITING", "FAILED_DELIVERY"]),
      }),
      request,
    );
    const order = (
      await db
        .select()
        .from(orders)
        .where(eq(orders.id, param(request, "orderId")))
        .limit(1)
    )[0];
    if (!order || !order.tripId || !order.stopId)
      throw new ApiError(404, "not_found", "Active trip order not found");
    const trip = await assertAssignedShipper(db, actor, order.tripId),
      stop = (
        await db.select().from(stops).where(eq(stops.id, order.stopId)).limit(1)
      )[0];
    const result = await idempotent(
      db,
      actor,
      request,
      `order:${order.id}:outcome`,
      body,
      async () => {
        if (order.status === body.outcome) return { status: 200, data: order };
        if (stop.passType === "PRIMARY") {
          if (stop.status !== "ARRIVED")
            throw new ApiError(
              409,
              "invalid_stop_state",
              "Primary stop must be ARRIVED",
            );
          if (body.outcome === "FAILED_DELIVERY")
            throw new ApiError(
              409,
              "invalid_outcome",
              "Primary attempt cannot fail directly",
            );
          if (
            body.outcome === "TEMP_WAITING" &&
            Date.now() < Date.parse(stop.minimumWaitEndsAt!)
          )
            throw new ApiError(
              409,
              "minimum_wait_active",
              "Customer unavailable unlocks after two minutes",
            );
          if (!["NOTIFIED_TO_COME_DOWN", "TEMP_WAITING"].includes(order.status))
            throw new ApiError(
              409,
              "invalid_order_state",
              "Order cannot receive this primary outcome",
            );
        } else {
          if (stop.status !== "RETRY_ARRIVED")
            throw new ApiError(
              409,
              "invalid_stop_state",
              "Retry stop must be RETRY_ARRIVED",
            );
          if (body.outcome === "TEMP_WAITING")
            throw new ApiError(
              409,
              "invalid_outcome",
              "Retry cannot return to TEMP_WAITING",
            );
          if (
            body.outcome === "FAILED_DELIVERY" &&
            Date.now() < Date.parse(stop.minimumWaitEndsAt!)
          )
            throw new ApiError(
              409,
              "minimum_wait_active",
              "Failed delivery unlocks after two minutes",
            );
          if (order.status !== OrderStatus.REDELIVERY_NEXT)
            throw new ApiError(
              409,
              "invalid_order_state",
              "Order is not in redelivery",
            );
        }
        const [updated] = await db
          .update(orders)
          .set({ status: body.outcome, updatedAt: nowIso() })
          .where(eq(orders.id, order.id))
          .returning();
        await audit(
          db,
          `ORDER_${body.outcome}`,
          actor.id,
          trip.merchantId,
          trip.id,
          { orderId: order.id, stopId: stop.id },
        );
        return { status: 200, data: updated };
      },
    );
    return reply.code(result.status).send(envelope(result.data));
  });
  app.post("/api/v1/stops/:stopId/complete", async (request, reply) => {
    const actor = await authenticate(db, request);
    const stop = (
      await db
        .select()
        .from(stops)
        .where(eq(stops.id, param(request, "stopId")))
        .limit(1)
    )[0];
    if (!stop) throw new ApiError(404, "not_found", "Stop not found");
    const trip = await assertAssignedShipper(db, actor, stop.tripId);
    const result = await idempotent(
      db,
      actor,
      request,
      `stop:${stop.id}:complete`,
      {},
      async () => {
        const terminal =
          stop.passType === "PRIMARY"
            ? ["DELIVERED", "TEMP_WAITING"]
            : ["DELIVERED", "FAILED_DELIVERY"];
        const stopOrders = await db
          .select()
          .from(orders)
          .where(and(eq(orders.tripId, trip.id), eq(orders.stopId, stop.id)));
        if (stopOrders.some((o) => !terminal.includes(o.status)))
          throw new ApiError(
            409,
            "stop_outcomes_incomplete",
            "Every order must have an individual terminal outcome",
          );
        const terminalStatus =
          stop.passType === "PRIMARY" ? "COMPLETED" : "RETRY_COMPLETED";
        if (stop.status === terminalStatus) return { status: 200, data: stop };
        if (!["ARRIVED", "RETRY_ARRIVED"].includes(stop.status))
          throw new ApiError(409, "invalid_stop_state", "Stop has not arrived");
        const [updated] = await db
          .update(stops)
          .set({
            status: terminalStatus,
            completedAt: nowIso(),
            updatedAt: nowIso(),
          })
          .where(eq(stops.id, stop.id))
          .returning();
        const next = (
          await db
            .select()
            .from(stops)
            .where(
              and(
                eq(stops.tripId, trip.id),
                eq(stops.passType, stop.passType),
                eq(
                  stops.status,
                  stop.passType === "PRIMARY" ? "WAITING" : "RETRY_WAITING",
                ),
              ),
            )
            .orderBy(asc(stops.sequence))
            .limit(1)
        )[0];
        if (next) {
          await db
            .update(stops)
            .set({
              status: stop.passType === "PRIMARY" ? "NEXT" : "RETRY_NEXT",
              updatedAt: nowIso(),
            })
            .where(eq(stops.id, next.id));
          await db
            .update(trips)
            .set({ currentStopId: next.id, updatedAt: nowIso() })
            .where(eq(trips.id, trip.id));
          await db
            .update(mockLocations)
            .set({ playbackStatus: "PLAYING", recordedAt: nowIso() })
            .where(eq(mockLocations.tripId, trip.id));
        }
        await audit(db, "STOP_COMPLETED", actor.id, trip.merchantId, trip.id, {
          stopId: stop.id,
        });
        return { status: 200, data: updated };
      },
    );
    return reply.code(result.status).send(envelope(result.data));
  });
  app.post("/api/v1/trips/:tripId/complete", async (request, reply) => {
    const actor = await authenticate(db, request),
      trip = await assertAssignedShipper(db, actor, param(request, "tripId"));
    const result = await idempotent(
      db,
      actor,
      request,
      `trip:${trip.id}:complete`,
      {},
      async () => {
        const allStops = await db
          .select()
          .from(stops)
          .where(eq(stops.tripId, trip.id));
        if (
          allStops.some(
            (s) => !["COMPLETED", "RETRY_COMPLETED"].includes(s.status),
          )
        )
          throw new ApiError(
            409,
            "trip_stops_incomplete",
            "All active stops must be completed",
          );
        const retryReady = (
          await db
            .select()
            .from(orders)
            .where(
              and(
                eq(orders.tripId, trip.id),
                eq(orders.status, OrderStatus.TEMP_WAITING_READY),
              ),
            )
            .limit(1)
        )[0];
        if (retryReady)
          throw new ApiError(
            409,
            "redelivery_required",
            "Ready waiting orders require redelivery",
          );
        await db
          .update(orders)
          .set({ status: OrderStatus.FAILED_DELIVERY, updatedAt: nowIso() })
          .where(
            and(
              eq(orders.tripId, trip.id),
              eq(orders.status, OrderStatus.TEMP_WAITING),
            ),
          );
        const [updated] = await db
          .update(trips)
          .set({
            status: TripStatus.COMPLETED,
            currentStopId: null,
            completedAt: nowIso(),
            updatedAt: nowIso(),
          })
          .where(eq(trips.id, trip.id))
          .returning();
        await db
          .update(mockLocations)
          .set({ playbackStatus: "STOPPED" })
          .where(eq(mockLocations.tripId, trip.id));
        await audit(
          db,
          "TRIP_COMPLETED",
          actor.id,
          trip.merchantId,
          trip.id,
          {},
        );
        return { status: 200, data: updated };
      },
    );
    return reply.code(result.status).send(envelope(result.data));
  });

  app.get("/api/v1/trips/:tripId/mock-location", async (request) => {
    const actor = await authenticate(db, request);
    const tripId = param(request, "tripId");
    await canViewTrip(db, actor, tripId);
    return envelope(await mockLocationView(db, tripId));
  });
  app.post(
    "/api/v1/trips/:tripId/mock-location/playback",
    async (request, reply) => {
      const actor = await authenticate(db, request),
        trip = await assertAssignedShipper(db, actor, param(request, "tripId"));
      const body = parseBody(
        z.object({ action: z.enum(["START", "PAUSE", "RESUME", "RESET"]) }),
        request,
      );
      if (!config.demoMode)
        throw new ApiError(403, "demo_mode_disabled", "Mock GPS is disabled");
      if (
        ["START", "RESUME"].includes(body.action) &&
        ![TripStatus.IN_PROGRESS, TripStatus.REDELIVERY].includes(trip.status as any)
      )
        throw new ApiError(409, "invalid_trip_state", "Trip is not active");
      const result = await idempotent(
        db,
        actor,
        request,
        `trip:${trip.id}:gps:${body.action}`,
        body,
        async () => {
          const location = (
            await db
              .select()
              .from(mockLocations)
              .where(eq(mockLocations.tripId, trip.id))
              .limit(1)
          )[0];
          if (!location)
            throw new ApiError(404, "not_found", "Mock location not found");
          let patch: Record<string, unknown> = {
            playbackStatus: body.action === "PAUSE" ? "PAUSED" : "PLAYING",
          };
          if (body.action === "RESET") {
            const first = (
              await db
                .select()
                .from(mockWaypoints)
                .orderBy(asc(mockWaypoints.waypointIndex))
                .limit(1)
            )[0];
            patch = {
              waypointIndex: first.waypointIndex,
              latitude: first.latitude,
              longitude: first.longitude,
              mapXRatio: first.mapXRatio,
              mapYRatio: first.mapYRatio,
              recordedAt: nowIso(),
              playbackStatus: "PAUSED",
            };
          } else if (body.action === "START" || body.action === "RESUME")
            patch.recordedAt = new Date(
              Date.now() - config.mockGpsIntervalMs,
            ).toISOString();
          const [updated] = await db
            .update(mockLocations)
            .set(patch)
            .where(eq(mockLocations.tripId, trip.id))
            .returning();
          await audit(
            db,
            `MOCK_GPS_${body.action}`,
            actor.id,
            trip.merchantId,
            trip.id,
            {},
          );
          return { status: 200, data: updated };
        },
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );
  app.post(
    "/api/v1/trips/:tripId/mock-location/advance",
    async (request, reply) => {
      const actor = await authenticate(db, request),
        trip = await assertAssignedShipper(db, actor, param(request, "tripId"));
      if (!config.demoMode)
        throw new ApiError(403, "demo_mode_disabled", "Mock GPS is disabled");
      if (
        ![TripStatus.IN_PROGRESS, TripStatus.REDELIVERY].includes(
          trip.status as any,
        )
      )
        throw new ApiError(409, "invalid_trip_state", "Trip is not active");
      const result = await idempotent(
        db,
        actor,
        request,
        `trip:${trip.id}:gps-advance`,
        {},
        async () => {
          const location = (
            await db
              .select()
              .from(mockLocations)
              .where(eq(mockLocations.tripId, trip.id))
              .limit(1)
          )[0];
          if (
            Date.now() - Date.parse(location.recordedAt) <
            config.mockGpsIntervalMs
          )
            throw new ApiError(
              409,
              "gps_interval_active",
              `Mock GPS publishes at most once every ${config.mockGpsIntervalMs} milliseconds`,
            );
          const updated = await advanceMockGps(db, trip.id);
          return { status: 200, data: updated };
        },
      );
      return reply.code(result.status).send(envelope(result.data));
    },
  );

  app.get("/api/v1/merchant/audit-events", async (request) => {
    const actor = await authenticate(db, request),
      merchant = await merchantOwnedBy(db, actor);
    const { page, perPage } = queryPage(request);
    return paginate(
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.merchantId, merchant.id))
        .orderBy(desc(auditEvents.createdAt)),
      page,
      perPage,
    );
  });
  app.get("/api/v1/trips/:tripId/events", async (request) => {
    const actor = await authenticate(db, request);
    await canViewTrip(db, actor, param(request, "tripId"));
    const q = request.query as Record<string, string>,
      after = q.after;
    const rows = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.tripId, param(request, "tripId")))
      .orderBy(asc(auditEvents.createdAt));
    return envelope(after ? rows.filter((row) => row.createdAt > after) : rows);
  });
  app.post("/api/v1/demo/reset", async (request, reply) => {
    const actor = await authenticate(db, request);
    if (!config.demoMode)
      throw new ApiError(403, "demo_mode_disabled", "Demo reset is disabled");
    const result = await idempotent(
      db,
      actor,
      request,
      "demo:reset",
      {},
      async () => {
        await resetSeed(db);
        return { status: 200, data: { reset: true } };
      },
    );
    return reply.code(result.status).send(envelope(result.data));
  });
}
