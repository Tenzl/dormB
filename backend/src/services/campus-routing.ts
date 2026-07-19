import campusRouteData from '../data/campus-route-segments.json' with { type: 'json' }
import campusLayoutData from '../data/campus-layout.json' with { type: 'json' }

export type Coordinate = [longitude: number, latitude: number]
export type LineStringFeature = {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: { type: 'LineString'; coordinates: Coordinate[] }
}

type CampusLocation = {
  id: string
  type: 'SHIPPER_START' | 'BUILDING_PICKUP' | 'ROAD_ANCHOR'
  longitude: number
  latitude: number
}

type CampusRouteSegment = {
  id: string
  fromLocationId: string
  toLocationId: string
  distanceMeters: number
  travelSeconds: number
  bidirectional: boolean
  geometry: { type: 'LineString'; coordinates: Coordinate[] }
}

type RestrictedArea = {
  id: string
  access: 'NO_SHIPPER'
  reason: string
  geometry: { type: 'Polygon'; coordinates: Coordinate[][] }
}

const locations = campusRouteData.locations as CampusLocation[]
const segments = campusRouteData.segments as CampusRouteSegment[]
const restrictedAreas = campusRouteData.routingPolicy.restrictedAreas as RestrictedArea[]
const locationMap = new Map(locations.map((location) => [location.id, location]))

function assertCoordinate(coordinate: unknown): asserts coordinate is Coordinate {
  if (!Array.isArray(coordinate) || coordinate.length !== 2 || coordinate.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('Campus route coordinate must be [longitude, latitude]')
  }
  if (Math.abs(coordinate[0]) > 180 || Math.abs(coordinate[1]) > 90) throw new Error('Campus route coordinate is outside geographic bounds')
}

function approximateMeters(from: Coordinate, to: Coordinate) {
  const longitudeMeters = (from[0] - to[0]) * 109300
  const latitudeMeters = (from[1] - to[1]) * 111000
  return Math.hypot(longitudeMeters, latitudeMeters)
}

function pointToSegmentMeters(point: Coordinate, from: Coordinate, to: Coordinate) {
  const segmentX = (to[0] - from[0]) * 109300
  const segmentY = (to[1] - from[1]) * 111000
  const pointX = (point[0] - from[0]) * 109300
  const pointY = (point[1] - from[1]) * 111000
  const lengthSquared = segmentX ** 2 + segmentY ** 2
  const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (pointX * segmentX + pointY * segmentY) / lengthSquared))
  return Math.hypot(pointX - segmentX * ratio, pointY - segmentY * ratio)
}

function orientation(a: Coordinate, b: Coordinate, c: Coordinate) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

function lineSegmentsIntersect(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate) {
  const epsilon = 1e-12
  const firstA = orientation(a, b, c)
  const firstB = orientation(a, b, d)
  const secondA = orientation(c, d, a)
  const secondB = orientation(c, d, b)
  return (Math.abs(firstA) < epsilon || Math.abs(firstB) < epsilon || firstA * firstB < 0) &&
    (Math.abs(secondA) < epsilon || Math.abs(secondB) < epsilon || secondA * secondB < 0)
}

function pointInsideRing(point: Coordinate, ring: Coordinate[]) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index]
    const b = ring[previous]
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

export function routeCrossesRestrictedArea(coordinates: Coordinate[], area: RestrictedArea) {
  const ring = area.geometry.coordinates[0]
  if (!ring || ring.length < 4) throw new Error(`Restricted area ${area.id} needs a closed polygon ring`)
  if (coordinates.some((coordinate) => pointInsideRing(coordinate, ring))) return true
  for (let routeIndex = 1; routeIndex < coordinates.length; routeIndex += 1) {
    for (let areaIndex = 1; areaIndex < ring.length; areaIndex += 1) {
      if (lineSegmentsIntersect(coordinates[routeIndex - 1], coordinates[routeIndex], ring[areaIndex - 1], ring[areaIndex])) return true
    }
  }
  return false
}

function validateCampusData() {
  const layoutBuildings = campusLayoutData.buildings
  if (layoutBuildings.length !== 25 || new Set(layoutBuildings.map((building) => building.code)).size !== layoutBuildings.length) throw new Error('Campus layout must contain 25 uniquely coded KTX Khu B buildings')
  for (const building of layoutBuildings) assertCoordinate([building.longitude, building.latitude])
  if (!locations.length || new Set(locations.map((location) => location.id)).size !== locations.length) throw new Error('Campus locations must have unique IDs')
  for (const area of restrictedAreas) {
    if (area.geometry.type !== 'Polygon' || area.geometry.coordinates.length !== 1) throw new Error(`Restricted area ${area.id} must be a single-ring Polygon`)
    const ring = area.geometry.coordinates[0]
    ring.forEach(assertCoordinate)
    if (ring.length < 4 || ring[0][0] !== ring.at(-1)?.[0] || ring[0][1] !== ring.at(-1)?.[1]) throw new Error(`Restricted area ${area.id} must have a closed ring`)
    for (const location of locations) {
      if (pointInsideRing([location.longitude, location.latitude], ring)) throw new Error(`Campus location ${location.id} is inside restricted area ${area.id}`)
    }
  }
  for (const segment of segments) {
    if (!locationMap.has(segment.fromLocationId) || !locationMap.has(segment.toLocationId)) throw new Error(`Campus segment ${segment.id} references an unknown location`)
    if (segment.distanceMeters <= 0 || segment.travelSeconds <= 0) throw new Error(`Campus segment ${segment.id} has invalid cost`)
    if (segment.geometry.type !== 'LineString' || segment.geometry.coordinates.length < 2) throw new Error(`Campus segment ${segment.id} needs a LineString with at least two coordinates`)
    segment.geometry.coordinates.forEach(assertCoordinate)
    for (const point of campusRouteData.routingPolicy.closedAccessPoints) {
      const closedCoordinate: Coordinate = [point.longitude, point.latitude]
      if (segment.geometry.coordinates.slice(1).some((coordinate, index) => pointToSegmentMeters(closedCoordinate, segment.geometry.coordinates[index], coordinate) < campusRouteData.routingPolicy.closedAccessRadiusMeters)) {
        throw new Error(`Campus segment ${segment.id} crosses closed access point ${point.id}`)
      }
    }
    for (const area of restrictedAreas) {
      if (routeCrossesRestrictedArea(segment.geometry.coordinates, area)) throw new Error(`Campus segment ${segment.id} crosses restricted area ${area.id}`)
    }
  }
  for (let from = 0; from < locations.length; from += 1) {
    for (let to = from + 1; to < locations.length; to += 1) getSegment(locations[from].id, locations[to].id)
  }
}

export function locationIdForBuilding(buildingId: string) {
  const code = buildingId.replace(/^building_/i, '').toUpperCase()
  if (!locationMap.has(code)) throw new Error(`No campus location for building ${buildingId}`)
  return code
}

export function getSegment(fromLocationId: string, toLocationId: string) {
  const direct = segments.find((segment) => segment.fromLocationId === fromLocationId && segment.toLocationId === toLocationId)
  if (direct) return { segment: direct, coordinates: direct.geometry.coordinates }
  const reverse = segments.find((segment) => segment.bidirectional && segment.fromLocationId === toLocationId && segment.toLocationId === fromLocationId)
  if (reverse) return { segment: reverse, coordinates: [...reverse.geometry.coordinates].reverse() }
  throw new Error(`Missing campus route segment ${fromLocationId} -> ${toLocationId}`)
}

export function buildTravelTimeMatrix(buildingIds: string[], startLocationId = 'CAMPUS_DEPOT') {
  const matrix: Record<string, Record<string, number>> = {}
  const nodeIds = [startLocationId, ...buildingIds]
  const locationId = (nodeId: string) => nodeId === startLocationId ? startLocationId : locationIdForBuilding(nodeId)
  for (const fromBuildingId of nodeIds) {
    matrix[fromBuildingId] = {}
    for (const toBuildingId of nodeIds) {
      const fromLocationId = locationId(fromBuildingId)
      const toLocationId = locationId(toBuildingId)
      if (fromLocationId === toLocationId) matrix[fromBuildingId][toBuildingId] = 0
      else {
        const { segment } = getSegment(fromLocationId, toLocationId)
        matrix[fromBuildingId][toBuildingId] = Math.max(1, segment.travelSeconds / 60)
      }
    }
  }
  return matrix
}

export function buildRouteSections(orderedStops: Array<{ id: string; buildingId: string }>, startLocationId = 'CAMPUS_DEPOT') {
  let fromLocationId = startLocationId
  return orderedStops.map((stop) => {
    const toLocationId = locationIdForBuilding(stop.buildingId)
    const stationary = fromLocationId === toLocationId
    const location = stationary ? campusLocation(toLocationId) : null
    const route = stationary
      ? { segment: { distanceMeters: 0, travelSeconds: 0 }, coordinates: [[location!.longitude, location!.latitude], [location!.longitude, location!.latitude]] as Coordinate[] }
      : getSegment(fromLocationId, toLocationId)
    const { segment, coordinates } = route
    const section = {
      id: `${fromLocationId.toLowerCase()}-to-${toLocationId.toLowerCase()}-${stop.id}`,
      fromLocationId,
      toLocationId,
      destinationStopId: stop.id,
      distanceMeters: segment.distanceMeters,
      travelSeconds: segment.travelSeconds,
      geometry: { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates } },
    }
    fromLocationId = toLocationId
    return section
  })
}

export function combineRouteSections(sections: ReturnType<typeof buildRouteSections>): LineStringFeature {
  const coordinates: Coordinate[] = []
  for (const section of sections) {
    for (const coordinate of section.geometry.geometry.coordinates) {
      const previous = coordinates.at(-1)
      if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) coordinates.push(coordinate)
    }
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }
}

export function routePointProjection(coordinates: Coordinate[], longitude: number, latitude: number, minimumCoordinateIndex = 0) {
  if (!coordinates.length) return { coordinateIndex: 0, progressRatio: 0, heading: 0 }
  let coordinateIndex = Math.max(0, Math.min(minimumCoordinateIndex, coordinates.length - 1))
  let bestDistance = Number.POSITIVE_INFINITY
  coordinates.forEach(([lng, lat], index) => {
    if (index < coordinateIndex) return
    const distance = (lng - longitude) ** 2 + (lat - latitude) ** 2
    if (distance < bestDistance) { bestDistance = distance; coordinateIndex = index }
  })
  const next = coordinates[Math.min(coordinateIndex + 1, coordinates.length - 1)]
  const current = coordinates[coordinateIndex]
  const heading = Math.atan2(next[0] - current[0], next[1] - current[1]) * 180 / Math.PI
  return { coordinateIndex, progressRatio: coordinates.length > 1 ? coordinateIndex / (coordinates.length - 1) : 1, heading }
}

export function campusRoutePayload() {
  return campusRouteData
}

export function campusLayoutPayload() {
  return campusLayoutData
}

export function campusLocation(id: string) {
  const location = locationMap.get(id)
  if (!location) throw new Error(`Unknown campus location ${id}`)
  return location
}

export function nearestCampusLocation(longitude: number, latitude: number) {
  const coordinate: Coordinate = [longitude, latitude]
  const location = locations.reduce<{ location: CampusLocation; distanceMeters: number } | null>((nearest, candidate) => {
    const distanceMeters = approximateMeters(coordinate, [candidate.longitude, candidate.latitude])
    return !nearest || distanceMeters < nearest.distanceMeters ? { location: candidate, distanceMeters } : nearest
  }, null)
  if (!location) throw new Error('Campus locations are missing')
  return location
}

validateCampusData()
