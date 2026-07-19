import type { FeatureCollection, LineString } from "geojson";
import type { DeliveryStop, RouteSection, Trip } from "../types";

function phaseForSection(section: RouteSection, trip: Trip) {
  const stop = trip.stops.find((item) => item.id === section.destinationStopId);
  if (stop?.status === "COMPLETED" || stop?.status === "RETRY_COMPLETED") return "completed";
  if (trip.currentStopId === section.destinationStopId) return "active";
  return "remaining";
}

export function buildRouteCollection(trip: Trip | null, mode: "active" | "proposed" = "active"): FeatureCollection<LineString> {
  if (!trip) return { type: "FeatureCollection", features: [] };
  const sections = mode === "proposed" ? (trip.proposedRouteSections ?? []) : trip.routeSections;
  const route = mode === "proposed" ? trip.proposedRouteGeoJson : trip.routeGeoJson;
  if (sections.length) {
    return {
      type: "FeatureCollection",
      features: sections.map((section) => ({
        ...section.geometry,
        properties: { sectionId: section.id, phase: phaseForSection(section, trip) },
      })),
    };
  }
  return route
    ? {
        type: "FeatureCollection",
        features: [{ ...route, properties: { phase: "remaining" } }],
      }
    : { type: "FeatureCollection", features: [] };
}

export function stopsForRoute(trip: Trip, mode: "active" | "proposed" = "active"): DeliveryStop[] {
  const stops = [...trip.stops].sort((left, right) => left.sequence - right.sequence);
  if (mode !== "proposed" || !trip.proposedRoute?.length) return stops;

  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const proposedIds = new Set(trip.proposedRoute);
  const fixedPrefix = stops.filter((stop) => !proposedIds.has(stop.id));
  const proposed = trip.proposedRoute
    .map((stopId) => stopById.get(stopId))
    .filter((stop): stop is DeliveryStop => Boolean(stop));
  return [...fixedPrefix, ...proposed];
}

export function routeFitSignature(trip: Trip | null, mode: "active" | "proposed" = "active") {
  if (!trip) return `none:${mode}`;
  const route = mode === "proposed" ? trip.proposedRouteGeoJson : trip.routeGeoJson;
  const routeIdentity = mode === "proposed" ? trip.recommendationId ?? "none" : trip.routeVersion;
  return `${trip.id}:${mode}:${routeIdentity}:${route?.geometry.coordinates.length ?? 0}`;
}
