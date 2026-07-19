import { describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import {
  buildOptimizationPolicyInput,
  OPTIMIZATION_POLICY_PROMPT_VERSION,
  OPTIMIZATION_POLICY_SYSTEM_PROMPT,
} from "../src/prompts/optimization-policy.js";
import {
  createPolicy,
  validatePolicyAgainstSnapshot,
  type OperationalSnapshot,
} from "../src/services/optimizer.js";

const snapshot: OperationalSnapshot = {
  generatedAt: "2026-07-19T06:00:00.000Z",
  startLocationId: "CAMPUS_DEPOT",
  merchantId: "merchant_green_bowl",
  shipper: {
    shipperId: "user_shipper",
    currentLatitude: 10.883162,
    currentLongitude: 106.781156,
    locationTimestamp: "2026-07-19T06:00:00.000Z",
  },
  orders: [
    {
      orderId: "order-c3",
      buildingId: "building_c3",
      status: "READY",
      readyAt: "2026-07-19T05:40:00.000Z",
      minutesWaiting: 20,
      foodCategory: "RICE",
      freshnessRisk: "HIGH",
      deliveryAttempt: 1,
    },
    {
      orderId: "order-d2",
      buildingId: "building_d2",
      status: "REDELIVERY_NEXT",
      readyAt: "2026-07-19T05:55:00.000Z",
      minutesWaiting: 5,
      foodCategory: "DRINK",
      freshnessRisk: "LOW",
      deliveryAttempt: 2,
    },
  ],
  buildings: [
    { buildingId: "building_c3", pickupLatitude: 10.883756, pickupLongitude: 106.78034, mapXRatio: 0, mapYRatio: 0 },
    { buildingId: "building_d2", pickupLatitude: 10.884338, pickupLongitude: 106.781741, mapXRatio: 0, mapYRatio: 0 },
  ],
  remainingStops: [
    { stopId: "stop-c3", buildingId: "building_c3", status: "WAITING", sequence: 1, temporarilyUnavailable: false },
    { stopId: "stop-d2", buildingId: "building_d2", status: "RETRY_WAITING", sequence: 2, temporarilyUnavailable: true },
  ],
  completedStopIds: [],
  currentStopId: null,
  travelTimeMatrix: {
    CAMPUS_DEPOT: { CAMPUS_DEPOT: 0, building_c3: 2, building_d2: 3 },
    building_c3: { CAMPUS_DEPOT: 2, building_c3: 0, building_d2: 4 },
    building_d2: { CAMPUS_DEPOT: 3, building_c3: 4, building_d2: 0 },
  },
};

const validPolicy = {
  buildingPriorities: [
    { buildingId: "building_c3", priorityScore: 75, reasons: ["20 phút chờ và rủi ro độ tươi cao"] },
    { buildingId: "building_d2", priorityScore: 90, reasons: ["Đơn giao lại lần hai"] },
  ],
  objectiveWeights: {
    travelTime: 1,
    orderWaiting: 1.5,
    freshnessRisk: 2,
    buildingBatchValue: 1,
    routeChangePenalty: 1,
  },
  hardConstraints: {
    preserveCurrentStop: true,
    preserveCompletedStops: true,
    includeEveryEligibleOrder: true,
    excludeUnavailableBuildingIds: ["building_d2"],
  },
  explanation: ["Ưu tiên được tính từ lần giao, thời gian chờ và độ tươi."],
  recommendationNeeded: true,
};

describe("OpenAI optimization policy prompt", () => {
  it("explains the AI boundary and sends the complete operational context", () => {
    const input = JSON.parse(buildOptimizationPolicyInput(snapshot));
    expect(input.promptVersion).toBe(OPTIMIZATION_POLICY_PROMPT_VERSION);
    expect(input.routeNetworkSemantics).toMatchObject({
      matrixContainsOnlyApprovedShipperRoads: true,
      closedCampusGatesExcluded: true,
      centralParkPedestrianPathsExcluded: true,
      finalRouteOwner: "ORTOOLS",
    });
    expect(input.snapshot.shipper).toEqual(snapshot.shipper);
    expect(input.snapshot.orders).toEqual(snapshot.orders);
    expect(input.snapshot.travelTimeMatrix).toEqual(snapshot.travelTimeMatrix);
    expect(OPTIMIZATION_POLICY_SYSTEM_PROMPT).toContain("second-attempt/redelivery");
    expect(OPTIMIZATION_POLICY_SYSTEM_PROMPT).toContain("Do not invent shortcuts");
    expect(OPTIMIZATION_POLICY_SYSTEM_PROMPT).toContain("exactly one buildingPriorities entry");
  });

  it("rejects missing, duplicated, or invented building priorities", () => {
    expect(() => validatePolicyAgainstSnapshot(snapshot, validPolicy)).not.toThrow();
    expect(() => validatePolicyAgainstSnapshot(snapshot, {
      ...validPolicy,
      buildingPriorities: [validPolicy.buildingPriorities[0]],
    })).toThrow(/every candidate building exactly once/);
    expect(() => validatePolicyAgainstSnapshot(snapshot, {
      ...validPolicy,
      buildingPriorities: [validPolicy.buildingPriorities[0], validPolicy.buildingPriorities[0]],
    })).toThrow(/every candidate building exactly once/);
    expect(() => validatePolicyAgainstSnapshot(snapshot, {
      ...validPolicy,
      buildingPriorities: [validPolicy.buildingPriorities[0], { ...validPolicy.buildingPriorities[1], buildingId: "invented" }],
    })).toThrow(/every candidate building exactly once/);
  });

  it("rejects AI changes to the authoritative unavailable-building set", () => {
    expect(() => validatePolicyAgainstSnapshot(snapshot, {
      ...validPolicy,
      hardConstraints: {
        ...validPolicy.hardConstraints,
        excludeUnavailableBuildingIds: [],
      },
    })).toThrow(/unavailable-building set/);
  });

  it("uses the same versioned decision policy in deterministic fallback mode", async () => {
    const result = await createPolicy({ openaiApiKey: undefined } as Config, snapshot);
    expect(result.source).toBe("FALLBACK");
    expect(result.promptVersion).toBe(OPTIMIZATION_POLICY_PROMPT_VERSION);
    expect(result.policy.buildingPriorities.map((item) => item.buildingId)).toEqual([
      "building_c3",
      "building_d2",
    ]);
    expect(result.policy.buildingPriorities.find((item) => item.buildingId === "building_d2")?.reasons).toContain("Có đơn giao lại lần hai");
  });
});
