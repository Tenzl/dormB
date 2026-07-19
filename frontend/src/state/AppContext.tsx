import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "../lib/api";
import { demoAccounts, initialDemoState } from "../data/seed";
import type {
  AsyncState,
  DemoState,
  OrderStatus,
  Role,
  Session,
  Trip,
} from "../types";

type Notice = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
};
type AppContextValue = {
  session: Session | null;
  data: DemoState;
  bootState: AsyncState;
  actions: Record<string, AsyncState>;
  notices: Notice[];
  demoFallback: boolean;
  arrivedAt: Record<string, number>;
  countdownEndsAt: number | null;
  announcedStops: string[];
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<boolean>;
  switchRole: (role: Role) => Promise<boolean>;
  resetDemo: () => Promise<void>;
  placeOrder: (productId: string) => Promise<void>;
  advanceOrder: (id: string) => Promise<void>;
  reviewMerchant: (
    id: string,
    status: "APPROVED" | "REJECTED",
  ) => Promise<void>;
  decideApplication: (
    id: string,
    decision: "APPROVED" | "REJECTED",
  ) => Promise<void>;
  deactivateShipper: (membershipId: string) => Promise<void>;
  submitApplication: (form: {
    merchantId: string;
    vehicleType: string;
    availability: string;
    experience: string;
    note: string;
  }) => Promise<void>;
  createTrip: () => Promise<void>;
  confirmRoute: () => Promise<void>;
  rejectRoute: () => Promise<void>;
  cancelCountdown: () => Promise<void>;
  announceStop: (stopId: string) => Promise<void>;
  arriveStop: (stopId: string) => Promise<void>;
  setOutcome: (
    stopId: string,
    orderId: string,
    outcome: "DELIVERED" | "TEMP_WAITING" | "FAILED_DELIVERY",
  ) => Promise<void>;
  completeStop: (stopId: string) => Promise<void>;
  studentReady: (orderId: string) => Promise<void>;
  markUnavailable: (stopId: string) => Promise<void>;
  recalculate: () => Promise<boolean>;
  gpsAction: (
    action: "start" | "pause" | "resume" | "advance" | "reset",
  ) => Promise<void>;
  dismissNotice: (id: number) => void;
};

const Context = createContext<AppContextValue | null>(null);
const orderFlow: OrderStatus[] = ["CREATED", "CONFIRMED", "PREPARING", "READY"];
let noticeId = 0;
const standaloneDemo = import.meta.env.VITE_STANDALONE_DEMO === "true";

function buildDemoTrip(data: DemoState): Trip | null {
  const eligible = data.orders.filter(
    (order) =>
      order.status === "READY" && order.merchantId === "merchant_green_bowl",
  );
  if (!eligible.length) return null;
  const buildings = [...new Set(eligible.map((order) => order.buildingId))];
  const prioritized = buildings.sort((a, b) =>
    a === "building_c3" ? -1 : b === "building_c3" ? 1 : a.localeCompare(b),
  );
  return {
    id: "TRIP-7206",
    recommendationId: "ROUTE-7206",
    merchantId: "merchant_green_bowl",
    shipperName: "Binh Le",
    status: "AWAITING_SHIPPER_CONFIRMATION",
    estimatedMinutes: 24,
    remainingEstimatedMinutes: 24,
    stops: prioritized.map((buildingId, index) => ({
      id: `STOP-${buildingId}`,
      buildingId,
      sequence: index + 1,
      status: "WAITING",
      orderIds: eligible
        .filter((order) => order.buildingId === buildingId)
        .map((order) => order.id),
    })),
    routeExplanation: [
      "C3 carries the oldest ready order.",
      "Building batching removes a repeated pickup.",
      "Every eligible ready order is included once.",
    ],
    routeVersion: 1,
    routeSections: [],
    gps: {
      longitude: 106.781156,
      latitude: 10.883162,
      heading: 0,
      progressRatio: 0,
      routeVersion: 1,
      x: 9,
      y: 78,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<DemoState>(initialDemoState);
  const [bootState, setBootState] = useState<AsyncState>("idle");
  const [actions, setActions] = useState<Record<string, AsyncState>>({});
  const [notices, setNotices] = useState<Notice[]>([]);
  const [demoFallback, setDemoFallback] = useState(false);
  const [arrivedAt, setArrivedAt] = useState<Record<string, number>>({});
  const [countdownEndsAt, setCountdownEndsAt] = useState<number | null>(null);
  const [announcedStops, setAnnouncedStops] = useState<string[]>([]);

  const clearSession = useCallback(() => {
    setSession(null);
    setBootState("idle");
    setData(initialDemoState);
    setDemoFallback(false);
  }, []);

  const notify = useCallback(
    (message: string, tone: Notice["tone"] = "success") => {
      setNotices((current) => [
        ...current.slice(-2),
        { id: ++noticeId, message, tone },
      ]);
    },
    [],
  );

  useEffect(() => {
    if (standaloneDemo) return;
    let cancelled = false;
    setBootState("loading");
    void api
      .restoreSession()
      .then(async (restored) => {
        const restoredData = await api.bootstrap(restored);
        if (cancelled) return;
        setSession(restored);
        setData(restoredData);
        setDemoFallback(false);
        setBootState("success");
      })
      .catch(() => {
        if (!cancelled) setBootState("idle");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (demoFallback || !session) return;
    try {
      const currentSession = await api.refreshSession(session);
      setSession((current) =>
        current &&
        (current.merchantStatus !== currentSession.merchantStatus ||
          current.merchantId !== currentSession.merchantId ||
          current.activeRole !== currentSession.activeRole ||
          current.roles.join("|") !== currentSession.roles.join("|"))
          ? currentSession
          : current,
      );
      setData(await api.bootstrap(currentSession));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        notify("Your session expired. Sign in again.", "info");
      }
      /* Transient failures keep the last confirmed projection. */
    }
  }, [clearSession, demoFallback, notify, session]);

  useEffect(() => {
    if (!session || demoFallback) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [session, demoFallback, refresh]);

  const run = useCallback(
    async (
      key: string,
      remote: () => Promise<unknown>,
      local: () => void,
      success: string,
    ) => {
      if (actions[key] === "loading") return;
      setActions((value) => ({ ...value, [key]: "loading" }));
      try {
        if (!demoFallback) await remote();
        local();
        setActions((value) => ({ ...value, [key]: "success" }));
        notify(success);
        if (!demoFallback) await refresh();
      } catch (error) {
        if (!demoFallback) {
          setActions((value) => ({ ...value, [key]: "error" }));
          notify(
            error instanceof Error
              ? error.message
              : "Action failed. Try again.",
            "error",
          );
        } else {
          setActions((value) => ({ ...value, [key]: "error" }));
        }
      }
    },
    [actions, demoFallback, notify, refresh],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setBootState("loading");
      const fallback = demoAccounts.find(
        (account) =>
          account.email?.toLowerCase() === email.trim().toLowerCase(),
      );
      try {
        if (standaloneDemo) throw new Error("Standalone demo enabled");
        const liveSession = await api.signIn(
          email.trim().toLowerCase(),
          password,
        );
        const resolved = {
          ...liveSession,
          merchantId: liveSession.merchantId ?? fallback?.merchantId,
        };
        const liveData = await api.bootstrap(resolved);
        setData(liveData);
        setSession(resolved);
        setDemoFallback(false);
      } catch (error) {
        if (!standaloneDemo) {
          void api.signOut().catch(() => undefined);
          setBootState("error");
          notify(
            error instanceof Error
              ? error.message
              : "Sign-in could not be completed.",
            "error",
          );
          return;
        }
        if (!fallback || password !== "demo123") {
          setBootState("error");
          notify("Email or password is incorrect.", "error");
          return;
        }
        setSession(fallback);
        setData(initialDemoState);
        setDemoFallback(true);
        notify(
          "Standalone seeded mode is enabled. Backend writes are intentionally disabled.",
          "info",
        );
      }
      setBootState("success");
    },
    [notify],
  );

  const signOut = useCallback(async () => {
    if (demoFallback || standaloneDemo) {
      clearSession();
      return true;
    }
    try {
      await api.signOut();
      clearSession();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        return true;
      }
      notify("Sign out could not reach the server. Try again.", "error");
      return false;
    }
  }, [clearSession, demoFallback, notify]);
  const switchRole = useCallback(async (role: Role) => {
    if (!session || !session.roles.includes(role)) return false;
    if (session.activeRole === role) return true;
    const nextSession = { ...session, activeRole: role };
    try {
      const nextData = demoFallback ? data : await api.bootstrap(nextSession);
      setData(nextData);
      setSession(nextSession);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        notify("Your session expired. Sign in again.", "info");
      } else {
        notify("This workspace could not be loaded.", "error");
      }
      return false;
    }
  }, [clearSession, data, demoFallback, notify, session]);
  const resetDemo = useCallback(
    async () =>
      run(
        "reset",
        api.resetDemo,
        () => {
          setData(initialDemoState);
          setArrivedAt({});
          setCountdownEndsAt(null);
        },
        "Seeded state restored.",
      ),
    [run],
  );

  const advanceOrder = useCallback(
    async (id: string) => {
      const order = data.orders.find((item) => item.id === id);
      if (!order) return;
      const next =
        orderFlow[
          Math.min(orderFlow.indexOf(order.status) + 1, orderFlow.length - 1)
        ];
      await run(
        `order-${id}`,
        () => api.advanceOrder(id, next),
        () =>
          setData((value) => ({
            ...value,
            orders: value.orders.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status: next,
                    readyAt:
                      next === "READY"
                        ? new Date().toISOString()
                        : item.readyAt,
                  }
                : item,
            ),
          })),
        `${id} moved to ${next.toLowerCase()}.`,
      );
    },
    [data.orders, run],
  );

  const placeOrder = useCallback(
    async (productId: string) => {
      const product = data.products.find((item) => item.id === productId);
      if (!product || !session?.buildingId) return;
      await run(
        `place-order-${productId}`,
        () => api.placeOrder(productId),
        () =>
          setData((value) => ({
            ...value,
            orders: [
              {
                id: `order-local-${Date.now()}`,
                studentName: session.name,
                studentId: session.userId,
                merchantId: product.merchantId,
                buildingId: session.buildingId!,
                productName: product.name,
                productId: product.id,
                status: "CREATED",
                attempt: 1,
              },
              ...value.orders,
            ],
          })),
        `${product.name} added as a new order.`,
      );
    },
    [data.products, run, session],
  );

  const reviewMerchant = useCallback(
    async (id: string, status: "APPROVED" | "REJECTED") =>
      run(
        `merchant-${id}`,
        () => api.reviewMerchant(id, status),
        () =>
          setData((value) => ({
            ...value,
            merchants: value.merchants.map((merchant) =>
              merchant.id === id
                ? { ...merchant, status, active: status === "APPROVED" }
                : merchant,
            ),
          })),
        `Merchant ${status.toLowerCase()}.`,
      ),
    [run],
  );

  const decideApplication = useCallback(
    async (id: string, decision: "APPROVED" | "REJECTED") =>
      run(
        `app-${id}-${decision}`,
        () => api.decideApplication(id, decision),
        () =>
          setData((value) => ({
            ...value,
            applications: value.applications.map((item) =>
              item.id === id ? { ...item, status: decision } : item,
            ),
          })),
        `Application ${decision.toLowerCase()}.`,
      ),
    [run],
  );
  const deactivateShipper = useCallback(
    async (membershipId: string) =>
      run(
        `deactivate-${membershipId}`,
        () => api.deactivateShipper(membershipId),
        () =>
          setData((value) => ({
            ...value,
            applications: value.applications.map((item) =>
              item.membershipId === membershipId
                ? { ...item, membershipId: undefined }
                : item,
            ),
          })),
        "Shipper membership deactivated.",
      ),
    [run],
  );
  const submitApplication = useCallback(
    async (form: {
      merchantId: string;
      vehicleType: string;
      availability: string;
      experience: string;
      note: string;
    }) =>
      run(
        "apply",
        () => api.submitApplication(form),
        () =>
          setData((value) => ({
            ...value,
            applications: [
              ...value.applications,
              {
                ...form,
                id: "APP-NEW",
                studentName: session?.name ?? "Student",
                status: "PENDING",
              },
            ],
          })),
        "Application sent to the merchant.",
      ),
    [run, session?.name],
  );

  const createTrip = useCallback(async () => {
    if (actions["create-trip"] === "loading") return;
    setActions((value) => ({ ...value, "create-trip": "loading" }));
    try {
      if (demoFallback) {
        const trip = buildDemoTrip(data);
        if (!trip) {
          notify("No ready orders available.", "info");
          setActions((value) => ({ ...value, "create-trip": "success" }));
          return;
        }
        const assigned = new Set(trip.stops.flatMap((stop) => stop.orderIds));
        setData((value) => ({
          ...value,
          trip,
          orders: value.orders.map((order) =>
            assigned.has(order.id)
              ? { ...order, status: "ASSIGNED_TO_TRIP" }
              : order,
          ),
        }));
      } else {
        const created = await api.readyToDeliver();
        const loaded = await api.getTrip(created.tripId, data);
        setData((value) => ({
          ...value,
          trip: loaded.trip,
          orders: loaded.orders,
        }));
      }
      setActions((value) => ({ ...value, "create-trip": "success" }));
      notify("Recommended route is ready for review.");
    } catch (error) {
      setActions((value) => ({ ...value, "create-trip": "error" }));
      notify(
        error instanceof Error ? error.message : "Trip generation failed.",
        "error",
      );
    }
  }, [actions, data, demoFallback, notify]);

  const confirmRoute = useCallback(async () => {
    if (!data.trip) return;
    const recommendationId = data.trip.recommendationId ?? data.trip.id;
    const priorStatus = data.trip.status;
    const recommendationType = data.trip.recommendationType ?? "INITIAL";
    await run(
      "confirm-route",
      () => api.confirmRoute(recommendationId),
      () => {
        const end = Date.now() + 5000;
        setCountdownEndsAt(end);
        setData((value) =>
          value.trip
            ? { ...value, trip: { ...value.trip, status: "STARTING" } }
            : value,
        );
        window.setTimeout(() => {
          if (demoFallback)
            setData((value) =>
              value.trip?.status === "STARTING"
                ? {
                    ...value,
                    trip:
                      recommendationType === "RECALCULATION"
                        ? { ...value.trip, status: priorStatus }
                        : {
                            ...value.trip,
                            status:
                              recommendationType === "REDELIVERY"
                                ? "REDELIVERY"
                                : "IN_PROGRESS",
                            currentStopId: value.trip.stops[0]?.id,
                            stops: value.trip.stops.map((stop, index) => ({
                              ...stop,
                              status:
                                index === 0
                                  ? recommendationType === "REDELIVERY"
                                    ? "RETRY_NEXT"
                                    : "NEXT"
                                  : stop.status,
                            })),
                          },
                  }
                : value,
            );
          else
            void api
              .activateRoute(recommendationId)
              .then(refresh)
              .catch((error) =>
                notify(
                  error instanceof Error
                    ? error.message
                    : "Route activation failed.",
                  "error",
                ),
              );
        }, 5100);
      },
      "Route confirmed. Activation countdown started.",
    );
  }, [data.trip, demoFallback, notify, refresh, run]);
  const rejectRoute = useCallback(async () => {
    if (data.trip)
      await run(
        "reject-route",
        () => api.rejectRoute(data.trip!.recommendationId ?? data.trip!.id),
        () => setData((value) => ({ ...value, trip: null })),
        "Route rejected. Orders returned safely.",
      );
  }, [data.trip, run]);
  const cancelCountdown = useCallback(async () => {
    if (data.trip)
      await run(
        "cancel-countdown",
        () => api.cancelCountdown(data.trip!.recommendationId ?? data.trip!.id),
        () => {
          setCountdownEndsAt(null);
          setData((value) =>
            value.trip
              ? {
                  ...value,
                  trip: {
                    ...value.trip,
                    status: "AWAITING_SHIPPER_CONFIRMATION",
                  },
                }
              : value,
          );
        },
        "Countdown cancelled. Route remains pending.",
      );
  }, [data.trip, run]);

  const announceStop = useCallback(
    async (stopId: string) => {
      if (data.trip)
        await run(
          `announce-${stopId}`,
          () => api.announceStop(data.trip!.id, stopId),
          () =>
            {
              const announcedAt = new Date().toISOString();
              setAnnouncedStops((current) =>
                current.includes(stopId) ? current : [...current, stopId],
              );
              setData((value) => value.trip ? {
                ...value,
                orders: value.orders.map((order) => value.trip!.stops.find((stop) => stop.id === stopId)?.orderIds.includes(order.id)
                  ? { ...order, status: "NOTIFIED_TO_COME_DOWN" }
                  : order),
                trip: {
                  ...value.trip,
                  stops: value.trip.stops.map((stop) => stop.id === stopId ? { ...stop, announcedAt } : stop),
                },
              } : value);
            },
          "Students can now track your approach.",
        );
    },
    [data.trip, run],
  );
  const arriveStop = useCallback(
    async (stopId: string) => {
      if (data.trip)
        await run(
          `arrive-${stopId}`,
          () => api.arriveStop(data.trip!.id, stopId),
          () => {
            setArrivedAt((value) => ({ ...value, [stopId]: Date.now() }));
            setData((value) =>
              value.trip
                ? {
                    ...value,
                    trip: {
                      ...value.trip,
                      currentStopId: stopId,
                      stops: value.trip.stops.map((stop) => ({
                        ...stop,
                        status: stop.id === stopId ? "ARRIVED" : stop.status,
                      })),
                    },
                  }
                : value,
            );
          },
          "Arrival recorded. Two-minute wait started.",
        );
    },
    [data.trip, run],
  );
  const setOutcome = useCallback(
    async (
      stopId: string,
      orderId: string,
      outcome: "DELIVERED" | "TEMP_WAITING" | "FAILED_DELIVERY",
    ) => {
      if (data.trip)
        await run(
          `outcome-${orderId}`,
          () => api.orderOutcome(data.trip!.id, stopId, orderId, outcome),
          () =>
            setData((value) => ({
              ...value,
              orders: value.orders.map((order) =>
                order.id === orderId ? { ...order, status: outcome } : order,
              ),
            })),
          outcome === "DELIVERED"
            ? "Order handed over."
            : "Order outcome recorded.",
        );
    },
    [data.trip, run],
  );
  const completeStop = useCallback(
    async (stopId: string) => {
      if (!data.trip || actions[`complete-${stopId}`] === "loading") return;
      setActions((value) => ({ ...value, [`complete-${stopId}`]: "loading" }));
      try {
        if (demoFallback)
          setData((value) => {
            if (!value.trip) return value;
            const index = value.trip.stops.findIndex(
              (stop) => stop.id === stopId,
            );
            const next = value.trip.stops[index + 1];
            if (next)
              return {
                ...value,
                trip: {
                  ...value.trip,
                  currentStopId: next.id,
                  stops: value.trip.stops.map((stop) =>
                    stop.id === stopId
                      ? { ...stop, status: "COMPLETED" }
                      : stop.id === next.id
                        ? { ...stop, status: "NEXT" }
                        : stop,
                  ),
                },
              };
            const retryOrders = value.orders.filter(
              (order) => order.status === "TEMP_WAITING_READY",
            );
            if (retryOrders.length) {
              const retryStops = [
                ...new Set(retryOrders.map((order) => order.buildingId)),
              ].map((buildingId, retryIndex) => ({
                id: `RETRY-${buildingId}`,
                buildingId,
                sequence: retryIndex + 1,
                status: "RETRY_WAITING" as const,
                orderIds: retryOrders
                  .filter((order) => order.buildingId === buildingId)
                  .map((order) => order.id),
              }));
              return {
                ...value,
                trip: {
                  ...value.trip,
                  status: "AWAITING_SHIPPER_CONFIRMATION",
                  currentStopId: undefined,
                  recommendationId: "ROUTE-REDELIVERY",
                  recommendationType: "REDELIVERY",
                  stops: retryStops,
                  routeExplanation: [
                    "Only students who marked themselves ready are included.",
                    "Orders remain grouped by building.",
                    "This is the one allowed retry.",
                  ],
                },
              };
            }
            return {
              ...value,
              orders: value.orders.map((order) =>
                order.status === "TEMP_WAITING"
                  ? { ...order, status: "FAILED_DELIVERY" }
                  : order,
              ),
              trip: {
                ...value.trip,
                currentStopId: undefined,
                status: "COMPLETED",
                stops: value.trip.stops.map((stop) =>
                  stop.id === stopId ? { ...stop, status: "COMPLETED" } : stop,
                ),
              },
            };
          });
        else if (session) {
          await api.completeStop(data.trip.id, stopId);
          let projected = await api.bootstrap(session);
          const primaryOpen = projected.trip?.stops.some((stop) =>
            ["WAITING", "NEXT", "ARRIVED"].includes(stop.status),
          );
          if (!primaryOpen && projected.trip) {
            if (
              projected.orders.some(
                (order) => order.status === "TEMP_WAITING_READY",
              )
            )
              await api.redelivery(projected.trip.id);
            else await api.completeTrip(projected.trip.id);
            projected = await api.bootstrap(session);
          }
          setData(projected);
        }
        setActions((value) => ({
          ...value,
          [`complete-${stopId}`]: "success",
        }));
        notify("Stop completed.");
      } catch (error) {
        setActions((value) => ({ ...value, [`complete-${stopId}`]: "error" }));
        notify(
          error instanceof Error
            ? error.message
            : "Stop could not be completed.",
          "error",
        );
      }
    },
    [actions, data.trip, demoFallback, notify, session],
  );
  const studentReady = useCallback(
    async (orderId: string) =>
      run(
        `student-ready-${orderId}`,
        () => api.studentReady(orderId),
        () =>
          setData((value) => ({
            ...value,
            orders: value.orders.map((order) =>
              order.id === orderId
                ? { ...order, status: "TEMP_WAITING_READY" }
                : order,
            ),
          })),
        "You are queued for one redelivery attempt.",
      ),
    [run],
  );
  const markUnavailable = useCallback(
    async (stopId: string) => {
      if (data.trip)
        await run(
          `unavailable-${stopId}`,
          () => api.markStopUnavailable(data.trip!.id, stopId),
          () =>
            setData((value) =>
              value.trip
                ? {
                    ...value,
                    trip: {
                      ...value.trip,
                      stops: value.trip.stops.map((stop) =>
                        stop.id === stopId
                          ? { ...stop, unavailable: true }
                          : stop,
                      ),
                    },
                  }
                : value,
            ),
          "Stop retained and marked temporarily unavailable.",
        );
    },
    [data.trip, run],
  );
  const recalculate = useCallback(async () => {
    if (!data.trip || actions.recalculate === "loading") return false;
    setActions((value) => ({ ...value, recalculate: "loading" }));
    try {
      if (demoFallback)
        setData((value) =>
          value.trip
            ? {
                ...value,
                trip: {
                  ...value.trip,
                  recommendationId: "ROUTE-RECALCULATED",
                  recommendationType: "RECALCULATION",
                  currentRoute: value.trip.stops.map((stop) => stop.id),
                  proposedRoute: [...value.trip.stops]
                    .reverse()
                    .map((stop) => stop.id),
                  routeExplanation: [
                    "High-risk orders move earlier.",
                    "Current and completed stops stay fixed.",
                    "Estimated freshness delay drops by 7 minutes.",
                  ],
                },
              }
            : value,
        );
      else {
        const recommendation = await api.recalculate(data.trip.id);
        setData((value) =>
          value.trip
            ? {
                ...value,
                trip: {
                  ...value.trip,
                  recommendationId: recommendation.id,
                  recommendationType: "RECALCULATION",
                  currentRoute: recommendation.currentRoute,
                  proposedRoute: recommendation.proposedRoute,
                  routeExplanation: recommendation.explanation ?? [],
                },
              }
            : value,
        );
      }
      setActions((value) => ({ ...value, recalculate: "success" }));
      notify("Revised route is ready to compare.");
      return true;
    } catch (error) {
      setActions((value) => ({ ...value, recalculate: "error" }));
      notify(
        error instanceof Error ? error.message : "Recalculation failed.",
        "error",
      );
      return false;
    }
  }, [actions.recalculate, data.trip, demoFallback, notify]);
  const gpsAction = useCallback(
    async (action: "start" | "pause" | "resume" | "advance" | "reset") => {
      if (data.trip)
        await run(
          `gps-${action}`,
          () => api.mockGps(data.trip!.id, action),
          () =>
            setData((value) =>
              value.trip
                ? {
                    ...value,
                    trip: {
                      ...value.trip,
                      gps: {
                        ...value.trip.gps,
                        longitude:
                          action === "reset"
                            ? 106.781156
                            : value.trip.gps.longitude - 0.00012,
                        latitude:
                          action === "reset"
                            ? 10.883162
                            : value.trip.gps.latitude + 0.00008,
                        progressRatio:
                          action === "reset"
                            ? 0
                            : Math.min(1, value.trip.gps.progressRatio + 0.08),
                        x:
                          action === "reset"
                            ? 9
                            : Math.min(88, (value.trip.gps.x ?? 9) + 12),
                        y:
                          action === "reset"
                            ? 78
                            : Math.max(22, (value.trip.gps.y ?? 78) - 8),
                        updatedAt: new Date().toISOString(),
                      },
                    },
                  }
                : value,
            ),
          `Mock movement ${action} command applied.`,
        );
    },
    [data.trip, run],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      session,
      data,
      bootState,
      actions,
      notices,
      demoFallback,
      arrivedAt,
      countdownEndsAt,
      announcedStops,
      signIn,
      signOut,
      switchRole,
      resetDemo,
      placeOrder,
      advanceOrder,
      reviewMerchant,
      decideApplication,
      deactivateShipper,
      submitApplication,
      createTrip,
      confirmRoute,
      rejectRoute,
      cancelCountdown,
      announceStop,
      arriveStop,
      setOutcome,
      completeStop,
      studentReady,
      markUnavailable,
      recalculate,
      gpsAction,
      dismissNotice: (id) =>
        setNotices((current) => current.filter((item) => item.id !== id)),
    }),
    [
      session,
      data,
      bootState,
      actions,
      notices,
      demoFallback,
      arrivedAt,
      countdownEndsAt,
      announcedStops,
      signIn,
      signOut,
      switchRole,
      resetDemo,
      placeOrder,
      advanceOrder,
      reviewMerchant,
      decideApplication,
      deactivateShipper,
      submitApplication,
      createTrip,
      confirmRoute,
      rejectRoute,
      cancelCountdown,
      announceStop,
      arriveStop,
      setOutcome,
      completeStop,
      studentReady,
      markUnavailable,
      recalculate,
      gpsAction,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be used within AppProvider");
  return value;
}
