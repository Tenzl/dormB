import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import { Buildings, LockSimple, MapPin, NavigationArrow } from "@phosphor-icons/react";
import { LngLatBounds } from "maplibre-gl";
import type { FeatureCollection, Polygon } from "geojson";
import type { Building, Trip } from "../../types";
import { buildRouteCollection, routeFitSignature, stopsForRoute } from "../../lib/mapGeometry";
import { useInterpolatedLocation } from "../../hooks/useInterpolatedLocation";

const CAMPUS_CENTER = { longitude: 106.7815, latitude: 10.8837 };
const CAMPUS_VIEW_BOUNDS: [[number, number], [number, number]] = [
  [106.7791, 10.88125],
  [106.78365, 10.88605],
];
const CAMPUS_MAX_BOUNDS: [[number, number], [number, number]] = [
  [106.773, 10.875],
  [106.79, 10.893],
];
const MAP_STYLE =
  import.meta.env.VITE_MAP_STYLE_URL ??
  "https://tiles.openfreemap.org/styles/positron";
const API_ROOT = import.meta.env.VITE_API_URL ?? "/api/v1";

type RestrictedAreaProperties = { id: string; access: string; reason: string };
const EMPTY_RESTRICTED_AREAS: FeatureCollection<Polygon, RestrictedAreaProperties> = { type: "FeatureCollection", features: [] };

type CampusDeliveryMapProps = {
  buildings: Building[];
  trip: Trip | null;
  studentBuildingId?: string;
  audience?: "operations" | "student";
  wide?: boolean;
  routeMode?: "active" | "proposed";
};

function MarkerLabel({ building, sequence, orderCount, active }: { building: Building; sequence?: number; orderCount: number; active: boolean }) {
  if (!active) return <div className="campus-context-marker">{building.code}</div>;
  return (
    <div className="campus-building-marker">
      <div className={`campus-building-icon ${active ? "is-active" : ""}`}>
        {sequence ? <span>{sequence}</span> : <Buildings size={15} aria-hidden="true" />}
      </div>
      <div className="campus-building-label">
        <strong>{building.code}</strong>
        {orderCount > 0 && <span>{orderCount} đơn</span>}
      </div>
    </div>
  );
}

export default function CampusDeliveryMap({ buildings, trip, studentBuildingId, audience = "operations", wide = false, routeMode = "active" }: CampusDeliveryMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [fatalError, setFatalError] = useState(false);
  const [restrictedAreas, setRestrictedAreas] = useState<FeatureCollection<Polygon, RestrictedAreaProperties>>(EMPTY_RESTRICTED_AREAS);
  const isStudentMap = audience === "student";
  const displayRoute = routeMode === "proposed" ? trip?.proposedRouteGeoJson : trip?.routeGeoJson;
  const routes = useMemo(() => buildRouteCollection(trip, routeMode), [trip, routeMode]);
  const routeSignature = routeFitSignature(trip, routeMode);
  const displayStops = useMemo(() => trip ? stopsForRoute(trip, routeMode) : [], [trip, routeMode]);
  const displaySequence = useMemo(() => new globalThis.Map(displayStops.map((stop, index) => [stop.id, index + 1])), [displayStops]);
  const interpolatedGps = useInterpolatedLocation(trip?.gps ?? { longitude: CAMPUS_CENTER.longitude, latitude: CAMPUS_CENTER.latitude, heading: 0, routeVersion: 0 });
  const announcedStop = trip?.stops.find((stop) => stop.buildingId === studentBuildingId && Boolean(stop.announcedAt));
  const studentRouteVisible = Boolean(trip && (trip.studentTracking?.routeVisible ?? trip.studentTracking?.visible ?? announcedStop));
  const studentLocationVisible = Boolean(trip && (trip.studentTracking?.locationVisible ?? true));
  const routeShouldRender = !isStudentMap || studentRouteVisible;
  const displayBuildings = isStudentMap
    ? buildings.filter((building) => building.id === studentBuildingId)
    : buildings;

  useEffect(() => {
    if (mapReady) return;
    const timeout = window.setTimeout(() => setFatalError(true), 8000);
    return () => window.clearTimeout(timeout);
  }, [mapReady]);

  useEffect(() => {
    if (isStudentMap) {
      setRestrictedAreas(EMPTY_RESTRICTED_AREAS);
      return;
    }
    const controller = new AbortController();
    void fetch(`${API_ROOT}/campus/route-segments`, { credentials: "include", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Restricted areas unavailable")))
      .then((payload) => {
        const areas = payload?.data?.routingPolicy?.restrictedAreas;
        if (!Array.isArray(areas)) return;
        setRestrictedAreas({
          type: "FeatureCollection",
          features: areas.map((area: { id: string; access: string; reason: string; geometry: Polygon }) => ({
            type: "Feature",
            properties: { id: area.id, access: area.access, reason: area.reason },
            geometry: area.geometry,
          })),
        });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [isStudentMap]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const coordinates = routeShouldRender ? (displayRoute?.geometry.coordinates ?? []) : [];
    const bounds = coordinates.reduce(
      (value, coordinate) => value.extend(coordinate),
      new LngLatBounds(CAMPUS_VIEW_BOUNDS[0], CAMPUS_VIEW_BOUNDS[1]),
    );
    mapRef.current.fitBounds(bounds, { padding: wide ? 46 : 30, maxZoom: 17.2, duration: 650 });
  }, [mapReady, routeSignature, routeShouldRender, wide]);

  const liveSummary = isStudentMap && !studentRouteVisible
    ? "The current shipper location is visible. The route to your building opens when the shipper starts heading there."
    : trip
    ? `Shipper is ${Math.round(trip.gps.progressRatio * 100)} percent through route version ${trip.routeVersion}.`
    : "No active trip. Route will appear when delivery begins.";

  if (fatalError) {
    return (
      <div className={`relative grid place-items-center overflow-hidden rounded-[2rem] border border-zinc-200 bg-[#ecece5] ${wide ? "aspect-[16/7] min-h-[300px]" : "aspect-[4/3] min-h-[290px]"}`} role="region" aria-label="Campus delivery map unavailable">
        <div className="absolute inset-0 map-grid opacity-40" aria-hidden="true" />
        <div className="relative max-w-xs rounded-2xl border border-white bg-white/90 p-4 text-center shadow-sm">
          <MapPin size={20} className="mx-auto text-emerald-700" />
          <p className="mt-2 text-sm font-semibold text-zinc-900">Map unavailable</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">The stop list below still shows the complete delivery sequence.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`campus-map relative overflow-hidden rounded-[2rem] border border-zinc-200 bg-[#ecece5] shadow-[inset_0_1px_0_rgba(255,255,255,.8)] ${wide ? "aspect-[16/7] min-h-[300px]" : "aspect-[4/3] min-h-[290px]"}`}
      role="region"
      aria-label="KTX Khu B delivery route map"
    >
      <Map
        ref={mapRef}
        initialViewState={{ ...CAMPUS_CENTER, zoom: 16.2 }}
        mapStyle={MAP_STYLE}
        minZoom={15}
        maxZoom={20}
        maxBounds={CAMPUS_MAX_BOUNDS}
        dragRotate={false}
        touchPitch={false}
        pitchWithRotate={false}
        renderWorldCopies={false}
        cooperativeGestures
        attributionControl={{ compact: true }}
        onLoad={() => setMapReady(true)}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {!isStudentMap && restrictedAreas.features.length > 0 && (
          <Source id="courier-restricted-areas" type="geojson" data={restrictedAreas}>
            <Layer id="restricted-area-fill" type="fill" paint={{ "fill-color": "#dc2626", "fill-opacity": 0.12 }} />
            <Layer id="restricted-area-outline" type="line" paint={{ "line-color": "#b91c1c", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.75 }} />
          </Source>
        )}
        {routeShouldRender && routes.features.length > 0 && (
          <Source id="delivery-route" type="geojson" data={routes}>
            <Layer id="route-casing" type="line" paint={{ "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.92 }} layout={{ "line-cap": "round", "line-join": "round" }} />
            <Layer id="route-completed" type="line" filter={["==", ["get", "phase"], "completed"]} paint={{ "line-color": "#a1a1aa", "line-width": 5, "line-opacity": 0.82 }} layout={{ "line-cap": "round", "line-join": "round" }} />
            <Layer id="route-remaining" type="line" filter={["==", ["get", "phase"], "remaining"]} paint={{ "line-color": "#86b9a6", "line-width": 5, "line-opacity": 0.9 }} layout={{ "line-cap": "round", "line-join": "round" }} />
            <Layer id="route-active" type="line" filter={["==", ["get", "phase"], "active"]} paint={{ "line-color": "#27765d", "line-width": 6, "line-opacity": 1 }} layout={{ "line-cap": "round", "line-join": "round" }} />
          </Source>
        )}
        {displayBuildings.map((building) => {
          const stop = trip?.stops.find((item) => item.buildingId === building.id);
          const orderCount = stop?.orderIds.length ?? 0;
          const active = studentBuildingId === building.id || Boolean(stop);
          return (
            <Marker key={building.id} longitude={building.longitude} latitude={building.latitude} anchor="bottom">
              <MarkerLabel building={building} sequence={!isStudentMap && stop ? displaySequence.get(stop.id) : undefined} orderCount={isStudentMap ? 0 : orderCount} active={active} />
            </Marker>
          );
        })}
        {trip && trip.gps.routeVersion === trip.routeVersion && (!isStudentMap || studentLocationVisible) && (
          <Marker longitude={interpolatedGps.longitude} latitude={interpolatedGps.latitude} anchor="center">
            <div className="campus-shipper-marker" aria-label="Mock shipper position" style={{ transform: `rotate(${interpolatedGps.heading}deg)` }}>
              <NavigationArrow size={18} weight="fill" aria-hidden="true" />
            </div>
          </Marker>
        )}
      </Map>
      {!isStudentMap && restrictedAreas.features.length > 0 && (
        <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-red-200 bg-white/90 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[.12em] text-red-800 shadow-sm backdrop-blur">
          Khu vực cấm shipper
        </div>
      )}
      {!trip && (
        <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 rounded-xl border border-white/80 bg-white/90 px-3 py-2 text-xs text-zinc-600 shadow-sm backdrop-blur">
          <MapPin size={15} className="text-emerald-700" /> Route appears after a trip begins.
        </div>
      )}
      {isStudentMap && trip && !studentRouteVisible && (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-start gap-3 rounded-2xl border border-white/80 bg-white/95 p-4 text-zinc-700 shadow-sm backdrop-blur">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-900 text-white"><LockSimple size={17} aria-hidden="true" /></span>
          <div><p className="text-sm font-semibold text-zinc-900">Shipper is completing earlier stops</p><p className="mt-1 text-xs leading-5 text-zinc-500">You can see the shipper now. The route to your building appears when it is your turn.</p></div>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{liveSummary}</p>
    </div>
  );
}
