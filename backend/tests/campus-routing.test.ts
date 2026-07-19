import { describe, expect, it } from "vitest";
import {
  buildRouteSections,
  buildTravelTimeMatrix,
  campusLayoutPayload,
  campusRoutePayload,
  combineRouteSections,
  getSegment,
  nearestCampusLocation,
  routeCrossesRestrictedArea,
  routePointProjection,
} from "../src/services/campus-routing.js";

describe("campus route data", () => {
  it("loads the complete KTX Khu B building layout", () => {
    const layout = campusLayoutPayload();
    expect(layout.buildings).toHaveLength(25);
    expect(new Set(layout.buildings.map((building) => building.code)).size).toBe(25);
    expect(layout.buildings.map((building) => building.code)).toEqual(expect.arrayContaining(["B1", "BA5", "C6", "D6", "E4"]));
  });

  it("contains every pair and valid GeoJSON longitude/latitude pairs", () => {
    const payload = campusRoutePayload();
    expect(payload.locations).toHaveLength(6);
    expect(payload.segments).toHaveLength(15);
    expect(payload.routingPolicy.closedAccessPoints).toHaveLength(4);
    expect(payload.routingPolicy.restrictedAreas).toHaveLength(1);
    expect(payload.routingPolicy.restrictedAreas[0].id).toBe("central-park-pedestrian-zone");
    for (const segment of payload.segments) {
      expect(segment.distanceMeters).toBeGreaterThan(0);
      expect(segment.travelSeconds).toBeGreaterThan(0);
      expect(segment.geometry.type).toBe("LineString");
      expect(segment.geometry.coordinates.length).toBeGreaterThan(1);
      for (const coordinate of segment.geometry.coordinates) {
        expect(coordinate).toHaveLength(2);
        expect(coordinate[0]).toBeGreaterThan(106);
        expect(coordinate[1]).toBeGreaterThan(10);
      }
    }
  });

  it("reverses bidirectional geometry and includes the campus start leg in the matrix", () => {
    const forward = getSegment("CAMPUS_DEPOT", "C1").coordinates;
    const reverse = getSegment("C1", "CAMPUS_DEPOT").coordinates;
    expect(reverse).toEqual([...forward].reverse());
    const matrix = buildTravelTimeMatrix(["building_c1", "building_d2"]);
    expect(matrix.CAMPUS_DEPOT.building_c1).toBeGreaterThan(0);
    expect(matrix.building_c1.building_d2).toBeGreaterThan(0);
    expect(matrix.building_d2.building_d2).toBe(0);
    const snappedMatrix = buildTravelTimeMatrix(["building_c3", "building_d2"], "C3");
    expect(snappedMatrix.C3.building_c3).toBe(0);
    expect(nearestCampusLocation(106.781156, 10.883162).location.id).toBe("CAMPUS_DEPOT");
    expect(nearestCampusLocation(106.78034, 10.883756).location.id).toBe("C3");
  });

  it("forces courier routes around the operator-confirmed central park", () => {
    const payload = campusRoutePayload();
    const restrictedArea = payload.routingPolicy.restrictedAreas[0];
    for (const segment of payload.segments) {
      expect(routeCrossesRestrictedArea(
        segment.geometry.coordinates as [number, number][],
        restrictedArea as Parameters<typeof routeCrossesRestrictedArea>[1],
      )).toBe(false);
    }
    const c3ToD2 = getSegment("C3", "D2").coordinates;
    expect(c3ToD2).toContainEqual([106.781156, 10.883162]);
    expect(c3ToD2.length).toBeGreaterThan(10);
  });

  it("combines ordered route sections without duplicating join coordinates", () => {
    const sections = buildRouteSections([
      { id: "stop-c1", buildingId: "building_c1" },
      { id: "stop-d2", buildingId: "building_d2" },
    ]);
    const route = combineRouteSections(sections);
    const expectedLength = sections[0].geometry.geometry.coordinates.length + sections[1].geometry.geometry.coordinates.length - 1;
    expect(route.geometry.coordinates).toHaveLength(expectedLength);
    const projection = routePointProjection(route.geometry.coordinates, route.geometry.coordinates[0][0], route.geometry.coordinates[0][1]);
    expect(projection.coordinateIndex).toBe(0);
    expect(projection.progressRatio).toBe(0);
    for (let index = 1; index < route.geometry.coordinates.length; index += 1) {
      expect(route.geometry.coordinates[index]).not.toEqual(route.geometry.coordinates[index - 1]);
    }
    const repeated = [[106.78, 10.88], [106.781, 10.881], [106.78, 10.88], [106.782, 10.882]] as [number, number][];
    expect(routePointProjection(repeated, 106.78, 10.88, 2).coordinateIndex).toBe(2);
  });

  it("advances monotonically through a multi-section route until completion", () => {
    const route = combineRouteSections(buildRouteSections([
      { id: "stop-c3", buildingId: "building_c3" },
      { id: "stop-d2", buildingId: "building_d2" },
      { id: "stop-e1", buildingId: "building_e1" },
    ]));
    const coordinates = route.geometry.coordinates;
    let coordinateIndex = 0;
    let position = coordinates[0];
    const progress: number[] = [];

    while (coordinateIndex < coordinates.length - 1) {
      const projection = routePointProjection(
        coordinates,
        position[0],
        position[1],
        coordinateIndex,
      );
      const nextIndex = Math.min(projection.coordinateIndex + 1, coordinates.length - 1);
      expect(nextIndex).toBeGreaterThan(coordinateIndex);
      coordinateIndex = nextIndex;
      position = coordinates[coordinateIndex];
      progress.push(coordinateIndex / (coordinates.length - 1));
    }

    expect(coordinateIndex).toBe(coordinates.length - 1);
    expect(progress.every((value, index) => index === 0 || value > progress[index - 1])).toBe(true);
    expect(progress.at(-1)).toBe(1);
  });
});
