import { LockSimple } from '@phosphor-icons/react'
import type { Building, Trip } from '../types'
import { CampusMap, RouteSequence } from './CampusMap'
import { EmptyState, StatusBadge } from './Ui'
import { Truck } from '@phosphor-icons/react'

export function RouteOverview({ trip, buildings, readOnly = true }: { trip: Trip | null; buildings: Building[]; readOnly?: boolean }) {
  const currentStop = trip?.stops.find((stop) => stop.id === trip.currentStopId)
  const currentBuilding = buildings.find((building) => building.id === currentStop?.buildingId)
  const remainingMinutes = trip ? trip.remainingEstimatedMinutes ?? trip.estimatedMinutes : 0
  return <div className="space-y-6">
    <CampusMap buildings={buildings} trip={trip} wide />
    {trip ? <div className="border-y border-zinc-300">
      <div className="grid gap-5 py-5 sm:grid-cols-3">
        <Metric label="Shipper" value={trip.shipperName} />
        <Metric label="Current stop" value={currentBuilding?.name ?? 'Leaving dispatch'} />
        <Metric label="Remaining ETA" value={Number.isFinite(remainingMinutes) ? `${Math.ceil(remainingMinutes)} min` : 'Live'} />
      </div>
      <div className="border-t border-zinc-200 py-5"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-sm font-semibold">Delivery route</p><div className="flex items-center gap-2">{readOnly && <LockSimple size={16} className="text-zinc-400" />}<StatusBadge status={trip.status} /></div></div><RouteSequence stops={trip.stops} buildings={buildings} currentStopId={trip.currentStopId} /></div>
    </div> : <EmptyState icon={Truck} title="No active delivery" description="The live shipper route will appear on this map as soon as a trip starts." />}
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-zinc-500">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-900">{value}</p></div>
}
