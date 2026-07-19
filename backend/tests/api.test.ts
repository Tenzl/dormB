import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import {
  validateSolverResult,
  type OperationalSnapshot,
} from "../src/services/optimizer.js";

let app: FastifyInstance;
const key = () => `test-${crypto.randomUUID()}`;
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dormitory:dormitory@127.0.0.1:5433/dormitory_test";
async function login(email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "x-auth-transport": "bearer" },
    payload: { email, password: "demo123" },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.token as string;
}
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
async function createAndStart(shipper: string) {
  const ready = await app.inject({
    method: "POST",
    url: "/api/v1/shipper/trips/ready",
    headers: { ...auth(shipper), "idempotency-key": key() },
  });
  expect(ready.statusCode).toBe(201);
  const { tripId, recommendationId } = ready.json().data;
  const confirm = await app.inject({
    method: "POST",
    url: `/api/v1/route-recommendations/${recommendationId}/confirm`,
    headers: { ...auth(shipper), "idempotency-key": key() },
  });
  expect(confirm.statusCode).toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 350));
  return tripId as string;
}

beforeEach(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("solver offline in unit test")),
  );
  app = await buildApp({
    databaseUrl: testDatabaseUrl,
    resetDatabaseOnStart: true,
    countdownSeconds: 0,
    waitSeconds: 0,
    solverTimeLimitSeconds: 1,
    openaiApiKey: undefined,
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await app.close();
});

describe("auth, ownership and preparation", () => {
  it("maps Fastify unsupported media type errors into the API error contract", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "content-type": "application/xml" },
      payload: "<login />",
    });
    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({
      error: {
        code: "unsupported_media_type",
        message: "Content-Type must be application/json",
      },
    });
  });
  it("issues a signed JWT cookie, accepts it, and revokes it on logout", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "x-auth-transport": "bearer" },
      payload: { email: "student@demo.local", password: "demo123" },
    });
    const token = loginResponse.json().data.token as string;
    expect(token.split(".")).toHaveLength(3);
    const setCookieHeader = loginResponse.headers["set-cookie"];
    const setCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader[0]
      : setCookieHeader;
    const cookie = setCookie?.split(";")[0];
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/auth/me",
          headers: { cookie: cookie! },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/auth/me",
          headers: auth(`${token.slice(0, -1)}x`),
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/logout",
          headers: auth(token),
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/auth/me",
          headers: auth(token),
        })
      ).statusCode,
    ).toBe(401);
  });
  it("shows only unassigned ready orders from the active shipper merchant", async () => {
    const shipper = await login("shipper@demo.local");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/shipper/orders/eligible",
      headers: auth(shipper),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(3);
    expect(
      response
        .json()
        .data.every(
          (order: {
            merchantId: string;
            status: string;
            tripId: string | null;
          }) =>
            order.merchantId === "merchant_green_bowl" &&
            order.status === "READY" &&
            order.tripId === null,
        ),
    ).toBe(true);
  });
  it("allows a student to place multiple independent orders at the same and different merchants", async () => {
    const student = await login("student@demo.local");
    const place = (productId: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/student/orders",
        headers: { ...auth(student), "idempotency-key": key() },
        payload: { product_id: productId },
      });
    const [riceOne, riceTwo, otherMerchant] = await Promise.all([
      place("product_rice"),
      place("product_rice"),
      place("product_other"),
    ]);
    expect([riceOne.statusCode, riceTwo.statusCode, otherMerchant.statusCode]).toEqual([201, 201, 201]);
    const created = [riceOne, riceTwo, otherMerchant].map((response) => response.json().data);
    expect(new Set(created.map((order) => order.id)).size).toBe(3);
    expect(created.filter((order) => order.merchantId === "merchant_green_bowl")).toHaveLength(2);
    expect(created.filter((order) => order.merchantId === "merchant_other")).toHaveLength(1);
    expect(created.every((order) => order.studentId === "user_student" && order.buildingId === "building_c3" && order.status === "CREATED")).toBe(true);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/student/orders",
      headers: auth(student),
    });
    expect(created.every((createdOrder) => list.json().data.some((order: { id: string }) => order.id === createdOrder.id))).toBe(true);
  });
  it("exposes demo accounts and merchant context without leaking other merchant orders", async () => {
    const demo = await app.inject({
      method: "GET",
      url: "/api/v1/auth/demo-accounts",
    });
    expect(demo.json().data).toHaveLength(5);
    const merchant = await login("merchant@demo.local");
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: auth(merchant),
    });
    expect(me.json().data.merchant_id).toBe("merchant_green_bowl");
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/merchant/orders",
      headers: auth(merchant),
    });
    expect(
      list
        .json()
        .data.every(
          (order: { merchantId: string }) =>
            order.merchantId === "merchant_green_bowl",
        ),
    ).toBe(true);
    expect(
      list
        .json()
        .data.some((order: { id: string }) => order.id === "order_other"),
    ).toBe(false);
  });
  it("lets only admins review merchants and inspect every active route", async () => {
    const admin = await login("admin@demo.local"),
      pending = await login("pending-merchant@demo.local"),
      shipper = await login("shipper@demo.local");
    const before = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: auth(pending),
    });
    expect(before.json().data.merchant_status).toBe("PENDING");
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/merchant/orders",
          headers: auth(pending),
        })
      ).statusCode,
    ).toBe(403);
    const reviewed = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/merchants/merchant_river_kitchen/status",
      headers: { ...auth(admin), "idempotency-key": key() },
      payload: { status: "APPROVED" },
    });
    expect(reviewed.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/merchant/orders",
          headers: auth(pending),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/admin/merchants",
          headers: auth(pending),
        })
      ).statusCode,
    ).toBe(403);
    const ready = await app.inject({
      method: "POST",
      url: "/api/v1/shipper/trips/ready",
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    const tripId = ready.json().data.tripId;
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/trips/${tripId}`,
          headers: auth(admin),
        })
      ).statusCode,
    ).toBe(200);
    const active = await app.inject({
      method: "GET",
      url: "/api/v1/admin/trips?status=active",
      headers: auth(admin),
    });
    expect(
      active.json().data.some((trip: { id: string }) => trip.id === tripId),
    ).toBe(true);
    const merchant = await login("merchant@demo.local");
    const rejected = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/merchants/merchant_green_bowl/status",
      headers: { ...auth(admin), "idempotency-key": key() },
      payload: { status: "REJECTED" },
    });
    expect(rejected.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/trips/${tripId}`,
          headers: auth(merchant),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/shipper/orders/eligible",
          headers: auth(shipper),
        })
      ).statusCode,
    ).toBe(403);
  });
  it("shows shipper position but withholds the student route until their stop is announced", async () => {
    const shipper = await login("shipper@demo.local");
    const student = await login("student@demo.local");
    const anotherStudent = await login("student2@demo.local");
    const tripId = await createAndStart(shipper);
    const before = await app.inject({
      method: "GET",
      url: `/api/v1/student/trips/${tripId}`,
      headers: auth(student),
    });
    expect(before.statusCode).toBe(200);
    const beforeData = before.json().data;
    expect(
      beforeData.orders.every(
          (order: { studentId: string }) => order.studentId === "user_student",
      ),
    ).toBe(true);
    expect(beforeData.orders[0].status).toBe("ASSIGNED_TO_TRIP");
    expect(beforeData.stops).toHaveLength(1);
    expect(beforeData.stops[0].buildingId).toBe("building_c3");
    expect(beforeData.recommendations).toEqual([]);
    expect(beforeData.mockLocation).not.toBeNull();
    expect(beforeData.routeGeoJson).toBeNull();
    expect(beforeData.routeSections).toEqual([]);
    expect(beforeData.studentTracking).toMatchObject({
      visible: false,
      locationVisible: true,
      routeVisible: false,
      state: "WAITING_FOR_ANNOUNCEMENT",
      buildingId: "building_c3",
    });

    const operationalTrip = await app.inject({
      method: "GET",
      url: `/api/v1/trips/${tripId}`,
      headers: auth(shipper),
    });
    const nextStop = operationalTrip
      .json()
      .data.stops.find((stop: { status: string }) => stop.status === "NEXT");
    expect(nextStop.buildingId).toBe("building_c3");
    const announced = await app.inject({
      method: "POST",
      url: `/api/v1/stops/${nextStop.id}/announce`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    expect(announced.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: `/api/v1/student/trips/${tripId}`,
      headers: auth(student),
    });
    const afterData = after.json().data;
    expect(afterData.orders[0].status).toBe("NOTIFIED_TO_COME_DOWN");
    expect(afterData.mockLocation).not.toBeNull();
    expect(afterData.routeGeoJson.geometry.coordinates.length).toBeGreaterThan(1);
    expect(afterData.routeSections).toHaveLength(1);
    expect(afterData.recommendations).toEqual([]);
    expect(afterData.studentTracking).toMatchObject({
      visible: true,
      locationVisible: true,
      routeVisible: true,
      state: "ON_THE_WAY",
      buildingId: "building_c3",
    });

    const waitingPeer = await app.inject({
      method: "GET",
      url: `/api/v1/student/trips/${tripId}`,
      headers: auth(anotherStudent),
    });
    expect(waitingPeer.json().data.mockLocation).not.toBeNull();
    expect(waitingPeer.json().data.routeGeoJson).toBeNull();
    expect(waitingPeer.json().data.studentTracking).toMatchObject({
      locationVisible: true,
      routeVisible: false,
      buildingId: "building_d2",
    });
  });
  it("enforces restaurant transitions and keeps later-ready order out of an existing trip", async () => {
    const merchant = await login("merchant@demo.local"),
      shipper = await login("shipper@demo.local");
    const ready = await app.inject({
      method: "POST",
      url: "/api/v1/shipper/trips/ready",
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    expect(ready.statusCode).toBe(201);
    const tripId = ready.json().data.tripId;
    const change = await app.inject({
      method: "PATCH",
      url: "/api/v1/merchant/orders/order_f1_1/status",
      headers: { ...auth(merchant), "idempotency-key": key() },
      payload: { status: "READY" },
    });
    expect(change.statusCode).toBe(200);
    const trip = await app.inject({
      method: "GET",
      url: `/api/v1/trips/${tripId}`,
      headers: auth(shipper),
    });
    expect(
      trip.json().data.orders.map((o: { id: string }) => o.id),
    ).not.toContain("order_f1_1");
  });
  it("approves atomically and prevents a second active merchant membership", async () => {
    const merchant = await login("merchant@demo.local"),
      student = await login("student@demo.local");
    const approved = await app.inject({
      method: "POST",
      url: "/api/v1/merchant/shipper-applications/application_pending/review",
      headers: { ...auth(merchant), "idempotency-key": key() },
      payload: { decision: "APPROVED" },
    });
    expect(approved.statusCode).toBe(200);
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: auth(student),
    });
    expect(me.json().data.active_membership.merchant_id).toBe(
      "merchant_green_bowl",
    );
    const submitted = await app.inject({
      method: "POST",
      url: "/api/v1/student/shipper-applications",
      headers: { ...auth(student), "idempotency-key": key() },
      payload: {
        merchant_id: "merchant_other",
        vehicle_type: "BICYCLE",
        availability: "Evenings",
        experience: "Campus routes",
      },
    });
    expect(submitted.statusCode).toBe(201);
    const other = await login("other-merchant@demo.local");
    const denied = await app.inject({
      method: "POST",
      url: `/api/v1/merchant/shipper-applications/${submitted.json().data.id}/review`,
      headers: { ...auth(other), "idempotency-key": key() },
      payload: { decision: "APPROVED" },
    });
    expect(denied.statusCode).toBe(409);
  });
});

describe("demo operations", () => {
  it("allows an authenticated shipper to restore seeded state in demo mode", async () => {
    const shipper = await login("shipper@demo.local");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/demo/reset",
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { reset: true } });
  });
  it("still denies unauthenticated demo reset", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/demo/reset",
      headers: { "idempotency-key": key() },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("unauthorized");
  });
});

describe("atomic claims and idempotency", () => {
  it("allows only one concurrent Ready claim and groups one stop per building", async () => {
    const shipper = await login("shipper@demo.local");
    const [a, b] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/shipper/trips/ready",
        headers: { ...auth(shipper), "idempotency-key": key() },
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/shipper/trips/ready",
        headers: { ...auth(shipper), "idempotency-key": key() },
      }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    const ok = a.statusCode === 201 ? a : b;
    const trip = await app.inject({
      method: "GET",
      url: `/api/v1/trips/${ok.json().data.tripId}`,
      headers: auth(shipper),
    });
    expect(trip.json().data.orders).toHaveLength(3);
    expect(
      new Set(
        trip.json().data.stops.map((s: { buildingId: string }) => s.buildingId),
      ).size,
    ).toBe(2);
  });
  it("replays the stored response for a completed idempotency key", async () => {
    const shipper = await login("shipper@demo.local"),
      same = key();
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/shipper/trips/ready",
      headers: { ...auth(shipper), "idempotency-key": same },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/shipper/trips/ready",
      headers: { ...auth(shipper), "idempotency-key": same },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
  });
});

describe("countdown, wait lock and route immutability", () => {
  it("activates server-side after countdown and restores through active-trip read", async () => {
    const shipper = await login("shipper@demo.local"),
      tripId = await createAndStart(shipper);
    const active = await app.inject({
      method: "GET",
      url: "/api/v1/trips/active",
      headers: auth(shipper),
    });
    expect(active.json().data.id).toBe(tripId);
    expect(active.json().data.status).toBe("IN_PROGRESS");
    expect(
      active
        .json()
        .data.stops.filter((s: { status: string }) => s.status === "NEXT"),
    ).toHaveLength(1);
  });
  it("keeps the current stop fixed while activating a remaining-route recalculation", async () => {
    const merchant = await login("merchant@demo.local"),
      shipper = await login("shipper@demo.local");
    await app.inject({
      method: "PATCH",
      url: "/api/v1/merchant/orders/order_f1_1/status",
      headers: { ...auth(merchant), "idempotency-key": key() },
      payload: { status: "READY" },
    });
    const tripId = await createAndStart(shipper);
    let view = (
      await app.inject({
        method: "GET",
        url: `/api/v1/trips/${tripId}`,
        headers: auth(shipper),
      })
    ).json().data;
    const current = view.stops.find(
      (s: { status: string }) => s.status === "NEXT",
    );
    await app.inject({
      method: "POST",
      url: `/api/v1/stops/${current.id}/announce`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/stops/${current.id}/arrive`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    const rec = await app.inject({
      method: "POST",
      url: `/api/v1/trips/${tripId}/recalculate`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    expect(rec.statusCode).toBe(201);
    expect(JSON.parse(rec.json().data.proposedRouteJson)).not.toContain(
      current.id,
    );
    const review = (
      await app.inject({
        method: "GET",
        url: `/api/v1/trips/${tripId}`,
        headers: auth(shipper),
      })
    ).json().data;
    expect(review.activeRouteSections.map((section: { destinationStopId: string }) => section.destinationStopId))
      .toEqual(view.activeRouteSections.map((section: { destinationStopId: string }) => section.destinationStopId));
    expect(review.proposedRouteSections.length).toBeGreaterThan(0);
    expect(review.proposedRouteSections[0].fromLocationId)
      .toBe(JSON.parse(rec.json().data.snapshotJson).startLocationId);
    await app.inject({
      method: "POST",
      url: `/api/v1/route-recommendations/${rec.json().data.id}/confirm`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    view = (
      await app.inject({
        method: "GET",
        url: `/api/v1/trips/${tripId}`,
        headers: auth(shipper),
      })
    ).json().data;
    const after = view.stops.find((s: { id: string }) => s.id === current.id);
    const remaining = view.stops.filter(
      (s: { id: string; passType: string }) =>
        s.passType === "PRIMARY" && s.id !== current.id,
    );
    expect(after.sequence).toBe(current.sequence);
    expect(
      remaining.every((s: { sequence: number }) => s.sequence > after.sequence),
    ).toBe(true);
    expect(
      new Set(
        view.stops
          .filter((s: { passType: string }) => s.passType === "PRIMARY")
          .map((s: { sequence: number }) => s.sequence),
      ).size,
    ).toBe(3);
  });
  it("cancels a countdown authoritatively before activation", async () => {
    await app.close();
    app = await buildApp({
      databaseUrl: testDatabaseUrl,
      resetDatabaseOnStart: true,
      countdownSeconds: 1,
      waitSeconds: 0,
      solverTimeLimitSeconds: 1,
      openaiApiKey: undefined,
    });
    const shipper = await login("shipper@demo.local");
    const ready = await app.inject({
      method: "POST",
      url: "/api/v1/shipper/trips/ready",
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    const rec = ready.json().data.recommendationId,
      tripId = ready.json().data.tripId;
    await app.inject({
      method: "POST",
      url: `/api/v1/route-recommendations/${rec}/confirm`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/route-recommendations/${rec}/cancel-countdown`,
          headers: { ...auth(shipper), "idempotency-key": key() },
        })
      ).statusCode,
    ).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const view = (
      await app.inject({
        method: "GET",
        url: `/api/v1/trips/${tripId}`,
        headers: auth(shipper),
      })
    ).json().data;
    expect(view.status).toBe("AWAITING_SHIPPER_CONFIRMATION");
  });
  it("persists mock GPS playback and advances on the five-second publisher interval", async () => {
    const shipper = await login("shipper@demo.local"),
      tripId = await createAndStart(shipper);
    const before = (
      await app.inject({
        method: "GET",
        url: `/api/v1/trips/${tripId}`,
        headers: auth(shipper),
      })
    ).json().data;
    await app.inject({
      method: "POST",
      url: `/api/v1/trips/${tripId}/mock-location/playback`,
      headers: { ...auth(shipper), "idempotency-key": key() },
      payload: { action: "START" },
    });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const location = (
      await app.inject({
        method: "GET",
        url: `/api/v1/trips/${tripId}/mock-location`,
        headers: auth(shipper),
      })
    ).json().data;
    expect(location.waypointIndex).toBe(1);
    expect(location.playbackStatus).toBe("PLAYING");
    expect(location.routeVersion).toBeGreaterThan(1);
    expect(location.progressRatio).toBeGreaterThan(0);
    expect(typeof location.heading).toBe("number");
    const after = (
      await app.inject({
        method: "GET",
        url: `/api/v1/trips/${tripId}`,
        headers: auth(shipper),
      })
    ).json().data;
    expect(after.remainingEstimatedMinutes).toBeLessThan(before.remainingEstimatedMinutes);
  });
  it("rejects mock GPS start before route activation", async () => {
    const shipper = await login("shipper@demo.local");
    const ready = await app.inject({
      method: "POST",
      url: "/api/v1/shipper/trips/ready",
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/trips/${ready.json().data.tripId}/mock-location/playback`,
      headers: { ...auth(shipper), "idempotency-key": key() },
      payload: { action: "START" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("invalid_trip_state");
  });
});

describe("minimum wait and redelivery", () => {
  it("rejects unavailable before two minutes while Delivered remains immediate", async () => {
    await app.close();
    app = await buildApp({
      databaseUrl: testDatabaseUrl,
      resetDatabaseOnStart: true,
      countdownSeconds: 0,
      waitSeconds: 120,
      solverTimeLimitSeconds: 1,
      openaiApiKey: undefined,
    });
    const shipper = await login("shipper@demo.local"),
      tripId = await createAndStart(shipper);
    const view = (
      await app.inject({
        method: "GET",
        url: `/api/v1/trips/${tripId}`,
        headers: auth(shipper),
      })
    ).json().data;
    const stop = view.stops.find(
      (s: { status: string }) => s.status === "NEXT",
    );
    await app.inject({
      method: "POST",
      url: `/api/v1/stops/${stop.id}/announce`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/stops/${stop.id}/arrive`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    const stopOrders = view.orders.filter(
      (o: { stopId: string }) => o.stopId === stop.id,
    );
    const unavailable = await app.inject({
      method: "POST",
      url: `/api/v1/orders/${stopOrders[0].id}/outcome`,
      headers: { ...auth(shipper), "idempotency-key": key() },
      payload: { outcome: "TEMP_WAITING" },
    });
    expect(unavailable.statusCode).toBe(409);
    const delivered = await app.inject({
      method: "POST",
      url: `/api/v1/orders/${stopOrders[0].id}/outcome`,
      headers: { ...auth(shipper), "idempotency-key": key() },
      payload: { outcome: "DELIVERED" },
    });
    expect(delivered.statusCode).toBe(200);
  });
  it("executes one end-of-route retry then completes failed delivery", async () => {
    const shipper = await login("shipper@demo.local"),
      student = await login("student@demo.local"),
      tripId = await createAndStart(shipper);
    let missed = false;
    while (true) {
      const view = (
        await app.inject({
          method: "GET",
          url: `/api/v1/trips/${tripId}`,
          headers: auth(shipper),
        })
      ).json().data;
      const next = view.stops.find(
        (s: { status: string }) => s.status === "NEXT",
      );
      if (!next) break;
      await app.inject({
        method: "POST",
        url: `/api/v1/stops/${next.id}/announce`,
        headers: { ...auth(shipper), "idempotency-key": key() },
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/stops/${next.id}/arrive`,
        headers: { ...auth(shipper), "idempotency-key": key() },
      });
      for (const order of view.orders.filter(
        (o: { stopId: string }) => o.stopId === next.id,
      )) {
        const outcome =
          order.id === "order_c3_1" && !missed
            ? ((missed = true), "TEMP_WAITING")
            : "DELIVERED";
        expect(
          (
            await app.inject({
              method: "POST",
              url: `/api/v1/orders/${order.id}/outcome`,
              headers: { ...auth(shipper), "idempotency-key": key() },
              payload: { outcome },
            })
          ).statusCode,
        ).toBe(200);
      }
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/stops/${next.id}/complete`,
            headers: { ...auth(shipper), "idempotency-key": key() },
          })
        ).statusCode,
      ).toBe(200);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/student/orders/order_c3_1/ready-for-redelivery",
          headers: { ...auth(student), "idempotency-key": key() },
        })
      ).statusCode,
    ).toBe(200);
    const redelivery = await app.inject({
      method: "POST",
      url: `/api/v1/trips/${tripId}/redelivery-recommendations`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    expect(redelivery.statusCode).toBe(201);
    const redeliveryReview = (
      await app.inject({
        method: "GET",
        url: `/api/v1/trips/${tripId}`,
        headers: auth(shipper),
      })
    ).json().data;
    const stopById = new Map<string, string>(redeliveryReview.stops.map((stop: { id: string; passType: string }) => [stop.id, stop.passType]));
    expect(redeliveryReview.activeRouteSections.every((section: { destinationStopId: string }) =>
      stopById.get(section.destinationStopId) === "PRIMARY"))
      .toBe(true);
    expect(redeliveryReview.proposedRouteSections.some((section: { destinationStopId: string }) =>
      stopById.get(section.destinationStopId) === "REDELIVERY"))
      .toBe(true);
    expect(redeliveryReview.proposedRouteSections[0].fromLocationId)
      .toBe(JSON.parse(redelivery.json().data.snapshotJson).startLocationId);
    await app.inject({
      method: "POST",
      url: `/api/v1/route-recommendations/${redelivery.json().data.id}/confirm`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    let view = (
      await app.inject({
        method: "GET",
        url: `/api/v1/trips/${tripId}`,
        headers: auth(shipper),
      })
    ).json().data;
    const activePasses = view.activeRouteSections.map((section: { destinationStopId: string }) =>
      new Map(view.stops.map((stop: { id: string; passType: string }) => [stop.id, stop.passType])).get(section.destinationStopId));
    const firstRetryIndex = activePasses.indexOf("REDELIVERY");
    expect(firstRetryIndex).toBeGreaterThan(0);
    expect(activePasses.slice(0, firstRetryIndex).every((pass: string) => pass === "PRIMARY")).toBe(true);
    expect(activePasses.slice(firstRetryIndex).every((pass: string) => pass === "REDELIVERY")).toBe(true);
    const retry = view.stops.find(
      (s: { status: string }) => s.status === "RETRY_NEXT",
    );
    await app.inject({
      method: "POST",
      url: `/api/v1/stops/${retry.id}/announce`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/stops/${retry.id}/arrive`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/orders/order_c3_1/outcome",
          headers: { ...auth(shipper), "idempotency-key": key() },
          payload: { outcome: "FAILED_DELIVERY" },
        })
      ).statusCode,
    ).toBe(200);
    await app.inject({
      method: "POST",
      url: `/api/v1/stops/${retry.id}/complete`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    const complete = await app.inject({
      method: "POST",
      url: `/api/v1/trips/${tripId}/complete`,
      headers: { ...auth(shipper), "idempotency-key": key() },
    });
    expect(complete.statusCode).toBe(200);
    view = (
      await app.inject({
        method: "GET",
        url: `/api/v1/trips/${tripId}`,
        headers: auth(shipper),
      })
    ).json().data;
    expect(view.status).toBe("COMPLETED");
    expect(
      view.orders.find((o: { id: string }) => o.id === "order_c3_1")
        .deliveryAttempt,
    ).toBe(2);
  });
});

it("rejects duplicated solver output and protects immutable prefixes", () => {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    startLocationId: "CAMPUS_DEPOT",
    merchantId: "m",
    shipper: {
      shipperId: "u",
      currentLatitude: 1,
      currentLongitude: 1,
      locationTimestamp: new Date().toISOString(),
    },
    orders: [],
    buildings: [
      {
        buildingId: "b",
        pickupLatitude: 1,
        pickupLongitude: 1,
        mapXRatio: 0.1,
        mapYRatio: 0.1,
      },
    ],
    remainingStops: [
      {
        stopId: "s",
        buildingId: "b",
        status: "WAITING",
        sequence: 3,
        temporarilyUnavailable: false,
      },
    ],
    completedStopIds: ["done"],
    currentStopId: "current",
    travelTimeMatrix: { CAMPUS_DEPOT: { CAMPUS_DEPOT: 0, b: 1 }, b: { CAMPUS_DEPOT: 1, b: 0 } },
  } satisfies OperationalSnapshot;
  expect(() =>
    validateSolverResult(snapshot, {
      status: "FEASIBLE",
      orderedStopIds: ["s", "s"],
      orderedBuildingIds: ["b", "b"],
      estimatedTravelMinutes: 0,
      estimatedServiceMinutes: 1,
      objectiveScore: 1,
    }),
  ).toThrow(/exactly once/);
  expect(() =>
    validateSolverResult(snapshot, {
      status: "FEASIBLE",
      orderedStopIds: ["current"],
      orderedBuildingIds: ["b"],
      estimatedTravelMinutes: 0,
      estimatedServiceMinutes: 1,
      objectiveScore: 1,
    }),
  ).toThrow();
});
