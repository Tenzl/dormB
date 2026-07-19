import { describe, expect, it } from "vitest";
import { isLocationDiscontinuity } from "./useInterpolatedLocation";

const point = (overrides: Partial<Parameters<typeof isLocationDiscontinuity>[0]> = {}) => ({
  longitude: 106.781,
  latitude: 10.883,
  heading: 0,
  routeVersion: 2,
  coordinateIndex: 12,
  ...overrides,
});

describe("GPS interpolation discontinuities", () => {
  it("snaps when reset moves playback backward on the same route version", () => {
    expect(isLocationDiscontinuity(point(), point({ coordinateIndex: 0 }))).toBe(true);
  });

  it("snaps on a route version change or a large geographic jump", () => {
    expect(isLocationDiscontinuity(point(), point({ routeVersion: 3 }))).toBe(true);
    expect(isLocationDiscontinuity(point(), point({ longitude: 106.783 }))).toBe(true);
  });

  it("interpolates a nearby forward waypoint", () => {
    expect(isLocationDiscontinuity(point(), point({ longitude: 106.7812, coordinateIndex: 13 }))).toBe(false);
  });
});
