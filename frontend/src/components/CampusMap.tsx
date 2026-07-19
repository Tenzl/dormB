import { lazy, Suspense } from "react";
import { MapPin } from "@phosphor-icons/react";
import type { Building, DeliveryStop, Trip } from "../types";

const CampusDeliveryMap = lazy(() => import("./map/CampusDeliveryMap"));

type CampusMapProps = {
  buildings: Building[];
  trip: Trip | null;
  studentBuildingId?: string;
  audience?: "operations" | "student";
  wide?: boolean;
  routeMode?: "active" | "proposed";
};

function MapLoading({ wide }: { wide: boolean }) {
  return (
    <div
      className={`relative grid place-items-center overflow-hidden rounded-[2rem] border border-zinc-200 bg-[#ecece5] ${wide ? "aspect-[16/7] min-h-[300px]" : "aspect-[4/3] min-h-[290px]"}`}
      role="status"
      aria-label="KTX Khu B delivery route map"
    >
      <div className="absolute inset-0 map-grid opacity-40" aria-hidden="true" />
      <div className="relative rounded-xl border border-white bg-white/90 px-3 py-2 text-xs text-zinc-600 shadow-sm">
        Loading KTX Khu B map…
      </div>
    </div>
  );
}

export function CampusMap(props: CampusMapProps) {
  return (
    <Suspense fallback={<MapLoading wide={Boolean(props.wide)} />}>
      <CampusDeliveryMap {...props} />
    </Suspense>
  );
}

export function RouteSequence({
  stops,
  buildings,
  currentStopId,
}: {
  stops: DeliveryStop[];
  buildings: Building[];
  currentStopId?: string;
}) {
  if (!stops.length) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
        <MapPin size={16} className="text-emerald-700" /> No active delivery stops.
      </div>
    );
  }
  return (
    <ol className="divide-y divide-zinc-200" aria-label="Delivery stop sequence">
      {stops.map((stop, index) => {
        const building = buildings.find((item) => item.id === stop.buildingId);
        const current = currentStopId === stop.id;
        return (
          <li
            key={stop.id}
            className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 py-4 ${stop.status === "COMPLETED" ? "opacity-45" : ""}`}
            aria-current={current ? "step" : undefined}
          >
            <span className={`grid h-9 w-9 place-items-center rounded-full font-mono text-xs ${current ? "bg-emerald-700 text-white" : "border border-zinc-300 text-zinc-600"}`}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-900">{building?.name ?? stop.buildingId}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {building?.pickupLabel} · {stop.orderIds.length} order{stop.orderIds.length === 1 ? "" : "s"}
              </p>
            </div>
            {stop.unavailable && <span className="font-mono text-[10px] text-amber-800">Unavailable</span>}
          </li>
        );
      })}
    </ol>
  );
}
