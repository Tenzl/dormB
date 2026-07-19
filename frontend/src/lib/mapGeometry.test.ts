import { describe, expect, it } from "vitest";
import type { Trip } from "../types";
import { buildRouteCollection, routeFitSignature, stopsForRoute } from "./mapGeometry";

const line = (coordinates: [number, number][]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates },
});

describe("map route geometry", () => {
  it("labels completed, active and remaining sections for MapLibre layers", () => {
    const trip = {
      id: "trip",
      merchantId: "merchant",
      shipperName: "Shipper",
      status: "IN_PROGRESS",
      estimatedMinutes: 5,
      currentStopId: "active",
      stops: [
        { id: "done", buildingId: "building_c1", sequence: 1, status: "COMPLETED", orderIds: [] },
        { id: "active", buildingId: "building_c3", sequence: 2, status: "NEXT", orderIds: [] },
        { id: "later", buildingId: "building_d2", sequence: 3, status: "WAITING", orderIds: [] },
      ],
      routeExplanation: [],
      routeVersion: 2,
      routeSections: ["done", "active", "later"].map((stopId, index) => ({
        id: `section-${stopId}`,
        fromLocationId: index ? "C1" : "CAMPUS_DEPOT",
        toLocationId: "C1",
        destinationStopId: stopId,
        distanceMeters: 100,
        travelSeconds: 30,
        geometry: line([[106.78 + index * 0.001, 10.88], [106.781 + index * 0.001, 10.881]]),
      })),
      gps: { longitude: 106.78, latitude: 10.88, heading: 0, progressRatio: 0.25, routeVersion: 2, updatedAt: new Date().toISOString() },
    } satisfies Trip;
    expect(buildRouteCollection(trip).features.map((feature) => feature.properties?.phase)).toEqual(["completed", "active", "remaining"]);
  });

  it("uses the full route as a remaining fallback when sections are absent", () => {
    const routeGeoJson = line([[106.78, 10.88], [106.79, 10.89]]);
    const trip = { routeSections: [], routeGeoJson } as unknown as Trip;
    const collection = buildRouteCollection(trip);
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].geometry.coordinates).toEqual(routeGeoJson.geometry.coordinates);
  });

  it("keeps proposed geometry separate from the active route", () => {
    const active = line([[106.78, 10.88], [106.781, 10.881]]);
    const proposed = line([[106.78, 10.88], [106.782, 10.882]]);
    const trip = { routeSections: [], routeGeoJson: active, proposedRouteSections: [], proposedRouteGeoJson: proposed } as unknown as Trip;
    expect(buildRouteCollection(trip, "active").features[0].geometry.coordinates).toEqual(active.geometry.coordinates);
    expect(buildRouteCollection(trip, "proposed").features[0].geometry.coordinates).toEqual(proposed.geometry.coordinates);
  });

  it("uses the proposed stop order after the immutable prefix", () => {
    const trip = {
      stops: [
        { id: "done", buildingId: "building_c1", sequence: 1, status: "COMPLETED", orderIds: [] },
        { id: "current", buildingId: "building_c3", sequence: 2, status: "ARRIVED", orderIds: [] },
        { id: "later-a", buildingId: "building_d2", sequence: 3, status: "WAITING", orderIds: [] },
        { id: "later-b", buildingId: "building_e1", sequence: 4, status: "WAITING", orderIds: [] },
      ],
      proposedRoute: ["later-b", "later-a"],
    } as unknown as Trip;
    expect(stopsForRoute(trip, "proposed").map((stop) => stop.id)).toEqual([
      "done",
      "current",
      "later-b",
      "later-a",
    ]);
  });

  it("does not refit an active route when only the recommendation changes", () => {
    const routeGeoJson = line([[106.78, 10.88], [106.79, 10.89]]);
    const base = { id: "trip", recommendationId: "recommendation-a", routeVersion: 3, routeGeoJson } as unknown as Trip;
    expect(routeFitSignature({ ...base, recommendationId: "recommendation-b" }, "active")).toBe(
      routeFitSignature(base, "active"),
    );
    expect(routeFitSignature({ ...base, recommendationId: "recommendation-b" }, "proposed")).not.toBe(
      routeFitSignature(base, "proposed"),
    );
  });
});
