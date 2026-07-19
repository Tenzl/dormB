import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DemoState } from "../types";

const jsonResponse = (data: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("API contract", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("unwraps login data and uses credentialed cookie requests", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(() =>
        jsonResponse({
          data: {
            token: "token-live-123",
            expires_at: "2026-07-20T00:00:00Z",
            user: {
              id: "user_student",
              name: "An Student",
              email: "student@demo.local",
              roles: ["STUDENT"],
              building_id: "building_c3",
            },
          },
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({ data: { id: "order_c3_1", status: "CONFIRMED" } }),
      );
    const { api } = await import("./api");
    const session = await api.signIn("student@demo.local", "demo123");
    expect(session.userId).toBe("user_student");
    expect(session.activeRole).toBe("STUDENT");
    await api.advanceOrder("order_c3_1", "CONFIRMED");
    const [, init] = fetchMock.mock.calls[1];
    const headers = init?.headers as Record<string, string>;
    expect(init?.credentials).toBe("include");
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Idempotency-Key"]).toHaveLength(36);
  });

  it("surfaces the backend nested error message and code", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse(
        {
          error: {
            code: "no_ready_orders",
            message: "No ready orders available",
          },
        },
        409,
      ),
    );
    const { api } = await import("./api");
    await expect(api.readyToDeliver()).rejects.toMatchObject({
      status: 409,
      code: "no_ready_orders",
      message: "No ready orders available",
    });
  });

  it("sends an empty JSON object for bodyless mutations", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        jsonResponse(
          { data: { tripId: "trip-1", recommendationId: "route-1" } },
          201,
        ),
      );
    const { api } = await import("./api");
    await api.readyToDeliver();
    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init?.body).toBe("{}");
    expect(headers["Idempotency-Key"]).toHaveLength(36);
  });

  it("sends the captured campus-gate coordinate when the shipper starts", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        jsonResponse(
          { data: { tripId: "trip-1", recommendationId: "route-1" } },
          201,
        ),
      );
    const { api } = await import("./api");
    await api.readyToDeliver({
      latitude: 10.883162,
      longitude: 106.781156,
      recordedAt: "2026-07-19T06:00:00.000Z",
      source: "DEMO_GATE",
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      start_location: {
        latitude: 10.883162,
        longitude: 106.781156,
        recorded_at: "2026-07-19T06:00:00.000Z",
        source: "DEMO_GATE",
      },
    });
  });

  it("places each product as an independent student order", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => jsonResponse({ data: { id: "order-new", status: "CREATED" } }, 201));
    const { api } = await import("./api");
    await api.placeOrder("product_rice");
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ product_id: "product_rice" });
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toHaveLength(36);
  });

  it("maps the backend live remaining ETA onto the trip", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({
        data: {
          id: "trip-live",
          merchantId: "merchant",
          shipperStudentId: "shipper",
          status: "IN_PROGRESS",
          routeVersion: 2,
          remainingEstimatedMinutes: 7.25,
          stops: [],
          orders: [],
          recommendations: [],
          routeSections: [],
          studentTracking: {
            visible: false,
            locationVisible: true,
            routeVisible: false,
            state: "WAITING_FOR_ANNOUNCEMENT",
            buildingId: "building_c3",
          },
        },
      }),
    );
    const { api } = await import("./api");
    const state = {
      merchants: [], products: [], buildings: [], orders: [], applications: [], trip: null,
    } satisfies DemoState;
    const result = await api.getTrip("trip-live", state);
    expect(result.trip?.remainingEstimatedMinutes).toBe(7.25);
    expect(result.trip?.studentTracking).toMatchObject({
      locationVisible: true,
      routeVisible: false,
      buildingId: "building_c3",
    });
  });

  it("refreshes merchant approval status without requiring another sign-in", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({
        data: {
          id: "user_pending_merchant",
          name: "Quynh Ho",
          email: "pending-merchant@demo.local",
          roles: ["MERCHANT"],
          merchant_id: "merchant_river_kitchen",
          merchant_status: "APPROVED",
        },
      }),
    );
    const { api } = await import("./api");
    const refreshed = await api.refreshSession({
      userId: "user_pending_merchant",
      name: "Quynh Ho",
      roles: ["MERCHANT"],
      activeRole: "MERCHANT",
      merchantId: "merchant_river_kitchen",
      merchantStatus: "PENDING",
    });
    expect(refreshed.merchantStatus).toBe("APPROVED");
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.credentials).toBe("include");
    expect(
      (init?.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });
});
