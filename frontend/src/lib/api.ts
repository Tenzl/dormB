import type {
  Building,
  DemoState,
  Merchant,
  Order,
  OrderStatus,
  Product,
  Role,
  RouteSection,
  Session,
  ShipperApplication,
  Trip,
} from "../types";

const API_ROOT = import.meta.env.VITE_API_URL ?? "/api/v1";

function preferredRole(roles: Role[]): Role {
  return roles.includes("ADMIN")
    ? "ADMIN"
    : roles.includes("MERCHANT")
      ? "MERCHANT"
      : roles.includes("SHIPPER")
        ? "SHIPPER"
        : "STUDENT";
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  _authenticated = true,
): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const body = payload as {
      message?: string;
      code?: string;
      error?: { message?: string; code?: string };
    } | null;
    throw new ApiError(
      body?.error?.message ??
        body?.message ??
        "The server could not complete this request.",
      response.status,
      body?.error?.code ?? body?.code,
    );
  }
  if (payload && typeof payload === "object" && "data" in payload)
    return (payload as { data: T }).data;
  return payload as T;
}

const mutate = <T>(path: string, init: RequestInit = {}) => {
  const method = (init.method ?? "POST").toUpperCase();
  const needsJsonBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method) && init.body === undefined;
  return request<T>(path, {
    ...init,
    body: needsJsonBody ? "{}" : init.body,
    headers: { "Idempotency-Key": crypto.randomUUID(), ...init.headers },
  });
};

type Raw = Record<string, any>;
const get = <T>(path: string) => request<T>(path);
const array = (value: unknown): Raw[] =>
  Array.isArray(value) ? (value as Raw[]) : [];

function mapTrip(raw: Raw | null, knownOrders: Order[]): Trip | null {
  if (!raw?.id) return null;
  const tripOrders = array(raw.orders).map(
    (order) =>
      ({
        id: order.id,
        studentName: order.studentName ?? order.studentId,
        studentId: order.studentId,
        merchantId: order.merchantId,
        buildingId: order.buildingId,
        productName: order.productName ?? order.productId,
        status: order.status,
        readyAt: order.readyAt ?? undefined,
        attempt: order.deliveryAttempt ?? 1,
      }) as Order,
  );
  const orders = tripOrders.length ? tripOrders : knownOrders;
  const recommendations = array(raw.recommendations);
  const activeRecommendation =
    [...recommendations]
      .reverse()
      .find((item) => ["PROPOSED", "CONFIRMED"].includes(item.status)) ??
    recommendations.at(-1);
  return {
    id: raw.id,
    recommendationId: activeRecommendation?.id,
    merchantId: raw.merchantId,
    shipperName: raw.shipperName ?? raw.shipperStudentId,
    status:
      activeRecommendation?.status === "PROPOSED" &&
      activeRecommendation?.recommendationType !== "RECALCULATION"
        ? "AWAITING_SHIPPER_CONFIRMATION"
        : raw.status,
    estimatedMinutes:
      activeRecommendation?.solverMetrics?.estimatedTravelMinutes ?? 0,
    remainingEstimatedMinutes:
      raw.remainingEstimatedMinutes != null
        ? Number(raw.remainingEstimatedMinutes)
        : undefined,
    currentStopId: raw.currentStopId ?? undefined,
    countdownEndsAt: raw.countdownEndsAt ?? undefined,
    stops: array(raw.stops).map((stop) => ({
      id: stop.id,
      buildingId: stop.buildingId,
      sequence: stop.sequence,
      status: stop.status,
      unavailable: stop.temporarilyUnavailable,
      announcedAt: stop.announcedAt ?? undefined,
      minimumWaitEndsAt: stop.minimumWaitEndsAt ?? undefined,
      orderIds: orders
        .filter(
          (order) =>
            order.id &&
            array(raw.orders).find((source) => source.id === order.id)
              ?.stopId === stop.id,
        )
        .map((order) => order.id),
    })),
    routeExplanation: activeRecommendation?.explanation ?? [],
    currentRoute: activeRecommendation?.currentRoute,
    proposedRoute: activeRecommendation?.proposedRoute,
    recommendationType: activeRecommendation?.recommendationType,
    routeVersion: raw.routeVersion ?? 1,
    routeGeoJson: raw.activeRouteGeoJson ?? raw.routeGeoJson,
    routeSections: array(raw.activeRouteSections ?? raw.routeSections) as RouteSection[],
    proposedRouteGeoJson: raw.proposedRouteGeoJson ?? undefined,
    proposedRouteSections: array(raw.proposedRouteSections) as RouteSection[],
    studentTracking: raw.studentTracking
      ? {
          visible: Boolean(raw.studentTracking.visible),
          locationVisible: Boolean(raw.studentTracking.locationVisible),
          routeVisible: Boolean(raw.studentTracking.routeVisible),
          state: raw.studentTracking.state,
          stopId: raw.studentTracking.stopId ?? undefined,
          buildingId: raw.studentTracking.buildingId ?? undefined,
          announcedAt: raw.studentTracking.announcedAt ?? undefined,
        }
      : undefined,
    gps: {
      longitude: raw.mockLocation?.longitude ?? 106.781156,
      latitude: raw.mockLocation?.latitude ?? 10.883162,
      heading: raw.mockLocation?.heading ?? 0,
      progressRatio: raw.mockLocation?.progressRatio ?? 0,
      routeVersion: raw.mockLocation?.routeVersion ?? raw.routeVersion ?? 1,
      coordinateIndex: raw.mockLocation?.coordinateIndex ?? raw.mockLocation?.waypointIndex,
      x:
        raw.mockLocation?.mapXRatio != null
          ? raw.mockLocation.mapXRatio *
            (raw.mockLocation.mapXRatio <= 1 ? 100 : 1)
          : 9,
      y:
        raw.mockLocation?.mapYRatio != null
          ? raw.mockLocation.mapYRatio *
            (raw.mockLocation.mapYRatio <= 1 ? 100 : 1)
          : 78,
      updatedAt: raw.mockLocation?.recordedAt ?? new Date().toISOString(),
    },
  };
}

async function bootstrap(session: Session): Promise<DemoState> {
  const [buildingRows, campusLayout, merchantRows] = await Promise.all([
    get<Raw[]>("/buildings"),
    get<Raw>("/campus/layout"),
    get<Raw[]>("/merchants"),
  ]);
  const mapMerchant = (item: Raw): Merchant => ({
    id: item.id,
    name: item.name,
    description: item.description ?? "",
    prepMinutes: item.prepMinutes ?? 18,
    active: item.status === "APPROVED",
    status: item.status ?? "APPROVED",
    ownerName: item.ownerName,
    ownerEmail: item.ownerEmail,
  });
  let merchants: Merchant[] = array(merchantRows).map(mapMerchant);
  const productRows = (
    await Promise.all(
      merchants.map((merchant) =>
        get<Raw[]>(`/merchants/${merchant.id}/products`),
      ),
    )
  ).flat();
  const products: Product[] = productRows.map((item) => ({
    id: item.id,
    merchantId: item.merchantId,
    name: item.name,
    price: item.price,
    category: item.category,
    description: item.description ?? item.category,
    available: item.isAvailable !== false,
  }));
  const serviceableByCode = new Map(array(buildingRows).map((item) => [item.code, item]));
  const buildings: Building[] = array(campusLayout.buildings).map((campusBuilding) => {
    const deliveryBuilding = serviceableByCode.get(campusBuilding.code);
    return {
      id: deliveryBuilding?.id ?? campusBuilding.id,
      code: campusBuilding.code,
      name: deliveryBuilding?.name ?? `Dormitory ${campusBuilding.code}`,
      pickupLabel: deliveryBuilding?.pickupPointName ?? "KTX Khu B residence",
      longitude: deliveryBuilding?.pickupLongitude ?? campusBuilding.longitude,
      latitude: deliveryBuilding?.pickupLatitude ?? campusBuilding.latitude,
      serviceable: Boolean(deliveryBuilding),
      x: deliveryBuilding ? deliveryBuilding.mapXRatio * (deliveryBuilding.mapXRatio <= 1 ? 100 : 1) : undefined,
      y: deliveryBuilding ? deliveryBuilding.mapYRatio * (deliveryBuilding.mapYRatio <= 1 ? 100 : 1) : undefined,
    };
  });
  let orderRows: Raw[] = [],
    applicationRows: Raw[] = [],
    membershipRows: Raw[] = [],
    tripRaw: Raw | null = null,
    tripRaws: Raw[] = [];
  if (session.activeRole === "ADMIN") {
    const [adminMerchants, activeTrips] = await Promise.all([
      get<Raw[]>("/admin/merchants"),
      get<Raw[]>("/admin/trips?status=active"),
    ]);
    merchants = array(adminMerchants).map(mapMerchant);
    tripRaws = array(activeTrips);
    tripRaw = tripRaws[0] ?? null;
    orderRows = tripRaws.flatMap((trip) => array(trip.orders));
  } else if (
    session.activeRole === "MERCHANT" &&
    session.merchantStatus === "APPROVED"
  ) {
    const [orders, applications, memberships, trips] = await Promise.all([
      get<Raw[]>("/merchant/orders"),
      get<Raw[]>("/merchant/shipper-applications"),
      get<Raw[]>("/merchant/shipper-memberships"),
      get<Raw[]>("/merchant/trips"),
    ]);
    orderRows = array(orders);
    applicationRows = array(applications);
    membershipRows = array(memberships);
    const active = array(trips).find(
      (item) => !["COMPLETED", "CANCELLED_BEFORE_START"].includes(item.status),
    );
    if (active?.id) tripRaw = await get<Raw>(`/trips/${active.id}`);
  } else if (session.activeRole === "STUDENT") {
    const [orders, applications] = await Promise.all([
      get<Raw[]>("/student/orders"),
      get<Raw[]>("/student/shipper-applications"),
    ]);
    orderRows = array(orders);
    applicationRows = array(applications);
    const active = orderRows.find((item) => item.tripId);
    if (active?.tripId) tripRaw = await get<Raw>(`/student/trips/${active.tripId}`);
  } else if (session.activeRole === "SHIPPER") {
    try {
      tripRaw = await get<Raw>("/shipper/trips/active");
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
    }
    orderRows = tripRaw
      ? array(tripRaw.orders)
      : array(await get<Raw[]>("/shipper/orders/eligible"));
  }
  const orders: Order[] = orderRows.map((item) => ({
    id: item.id,
    studentName: item.studentName ?? item.studentId,
    studentId: item.studentId,
    merchantId: item.merchantId,
    buildingId: item.buildingId,
    productName:
      products.find((product) => product.id === item.productId)?.name ??
      item.productId,
    productId: item.productId,
    status: item.status,
    readyAt: item.readyAt ?? undefined,
    attempt: item.deliveryAttempt ?? 1,
  }));
  const applications: ShipperApplication[] = applicationRows.map((item) => ({
    id: item.id,
    studentId: item.studentId,
    membershipId: membershipRows.find(
      (membership) =>
        membership.studentId === item.studentId && membership.isActive,
    )?.id,
    studentName: item.studentName ?? item.studentId,
    merchantId: item.merchantId,
    vehicleType: item.vehicleType,
    availability: item.availability,
    experience: item.experience,
    note: item.note ?? "",
    status: item.status,
  }));
  const trips = tripRaws
    .map((trip) => mapTrip(trip, orders))
    .filter((trip): trip is Trip => trip !== null);
  return {
    merchants,
    products,
    buildings,
    orders,
    applications,
    trip: mapTrip(tripRaw, orders),
    trips,
  };
}

export const api = {
  restoreSession: async (): Promise<Session> => {
    const user = await get<{
      id: string;
      name: string;
      email: string;
      roles: Role[];
      building_id?: string | null;
      merchant_id?: string | null;
      merchant_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
      active_membership?: { merchantId?: string; merchant_id?: string } | null;
    }>("/auth/me");
    const activeRole = preferredRole(user.roles);
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      activeRole,
      buildingId: user.building_id ?? undefined,
      merchantId:
        user.merchant_id ??
        user.active_membership?.merchantId ??
        user.active_membership?.merchant_id ??
        undefined,
      merchantStatus: user.merchant_status ?? undefined,
    };
  },
  refreshSession: async (session: Session): Promise<Session> => {
    const user = await get<{
      id: string;
      name: string;
      email: string;
      roles: Role[];
      building_id?: string | null;
      merchant_id?: string | null;
      merchant_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
      active_membership?: { merchantId?: string; merchant_id?: string } | null;
    }>("/auth/me");
    const activeRole = user.roles.includes(session.activeRole)
      ? session.activeRole
      : preferredRole(user.roles);
    return {
      ...session,
      userId: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      activeRole,
      buildingId: user.building_id ?? undefined,
      merchantId:
        user.merchant_id ??
        user.active_membership?.merchantId ??
        user.active_membership?.merchant_id ??
        undefined,
      merchantStatus: user.merchant_status ?? undefined,
    };
  },
  signIn: async (email: string, password: string) => {
    const result = await request<{
      token?: string;
      session: { expires_at: string };
      user: {
        id: string;
        name: string;
        email: string;
        roles: Role[];
        building_id?: string | null;
        merchant_id?: string | null;
        merchant_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
        active_membership?: {
          merchantId?: string;
          merchant_id?: string;
        } | null;
      };
    }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      false,
    );
    if (!result.user)
      throw new ApiError(
        "Sign-in response did not include a user session.",
        500,
        "missing_session",
      );
    const activeRole = preferredRole(result.user.roles);
    return {
      userId: result.user.id,
      name: result.user.name,
      email: result.user.email,
      roles: result.user.roles,
      buildingId: result.user.building_id ?? undefined,
      merchantId:
        result.user.merchant_id ??
        result.user.active_membership?.merchantId ??
        result.user.active_membership?.merchant_id ??
        undefined,
      merchantStatus: result.user.merchant_status ?? undefined,
      activeRole,
    };
  },
  signOut: async () => request<void>("/auth/logout", { method: "POST" }),
  bootstrap,
  getTrip: async (tripId: string, state: DemoState) => {
    const raw = await get<Raw>(`/trips/${tripId}`);
    const orders: Order[] = array(raw.orders).map((item) => ({
      id: item.id,
      studentName: item.studentName ?? item.studentId,
      studentId: item.studentId,
      merchantId: item.merchantId,
      buildingId: item.buildingId,
      productName:
        state.products.find((product) => product.id === item.productId)?.name ??
        item.productId,
      productId: item.productId,
      status: item.status,
      readyAt: item.readyAt ?? undefined,
      attempt: item.deliveryAttempt ?? 1,
    }));
    return { trip: mapTrip(raw, orders), orders };
  },
  resetDemo: () => mutate<DemoState>("/demo/reset", { method: "POST" }),
  advanceOrder: (orderId: string, status: OrderStatus) =>
    mutate(`/merchant/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  placeOrder: (productId: string) =>
    mutate<Raw>("/student/orders", {
      method: "POST",
      body: JSON.stringify({ product_id: productId }),
    }),
  reviewMerchant: (merchantId: string, status: "APPROVED" | "REJECTED") =>
    mutate(`/admin/merchants/${merchantId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  submitApplication: (body: {
    merchantId?: string;
    vehicleType?: string;
    availability?: string;
    experience?: string;
    note?: string;
  }) =>
    mutate("/student/shipper-applications", {
      method: "POST",
      body: JSON.stringify({
        merchant_id: body.merchantId,
        vehicle_type: body.vehicleType,
        availability: body.availability,
        experience: body.experience,
        note: body.note,
      }),
    }),
  decideApplication: (id: string, decision: "APPROVED" | "REJECTED") =>
    mutate(`/merchant/shipper-applications/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  deactivateShipper: (id: string) =>
    mutate(`/merchant/shipper-memberships/${id}/deactivate`, {
      method: "POST",
    }),
  readyToDeliver: () =>
    mutate<{ tripId: string; recommendationId: string }>(
      "/shipper/trips/ready",
      { method: "POST" },
    ),
  confirmRoute: (recommendationId: string) =>
    mutate(`/route-recommendations/${recommendationId}/confirm`, {
      method: "POST",
    }),
  rejectRoute: (recommendationId: string) =>
    mutate(`/route-recommendations/${recommendationId}/reject`, {
      method: "POST",
    }),
  cancelCountdown: (recommendationId: string) =>
    mutate(`/route-recommendations/${recommendationId}/cancel-countdown`, {
      method: "POST",
    }),
  activateRoute: (recommendationId: string) =>
    mutate(`/route-recommendations/${recommendationId}/activate`, {
      method: "POST",
    }),
  announceStop: (_tripId: string, stopId: string) =>
    mutate(`/stops/${stopId}/announce`, { method: "POST" }),
  arriveStop: (_tripId: string, stopId: string) =>
    mutate(`/stops/${stopId}/arrive`, { method: "POST" }),
  orderOutcome: (
    _tripId: string,
    _stopId: string,
    orderId: string,
    outcome: "DELIVERED" | "TEMP_WAITING" | "FAILED_DELIVERY",
  ) =>
    mutate(`/orders/${orderId}/outcome`, {
      method: "POST",
      body: JSON.stringify({ outcome }),
    }),
  completeStop: (_tripId: string, stopId: string) =>
    mutate(`/stops/${stopId}/complete`, { method: "POST" }),
  studentReady: (orderId: string) =>
    mutate(`/student/orders/${orderId}/ready-for-redelivery`, {
      method: "POST",
    }),
  recalculate: (tripId: string) =>
    mutate<{
      id: string;
      explanation?: string[];
      currentRoute?: string[];
      proposedRoute?: string[];
      recommendationType?: "RECALCULATION";
    }>(`/trips/${tripId}/recalculate`, { method: "POST" }),
  redelivery: (tripId: string) =>
    mutate<{ id: string }>(`/trips/${tripId}/redelivery-recommendations`, {
      method: "POST",
    }),
  completeTrip: (tripId: string) =>
    mutate(`/trips/${tripId}/complete`, { method: "POST" }),
  markStopUnavailable: (_tripId: string, stopId: string) =>
    mutate(`/stops/${stopId}/temporarily-unavailable`, { method: "POST" }),
  mockGps: (
    tripId: string,
    action: "start" | "pause" | "resume" | "advance" | "reset",
  ) =>
    action === "advance"
      ? mutate(`/trips/${tripId}/mock-location/advance`, { method: "POST" })
      : mutate(`/trips/${tripId}/mock-location/playback`, {
          method: "POST",
          body: JSON.stringify({ action: action.toUpperCase() }),
        }),
};
