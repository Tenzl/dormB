const fs = require("node:fs");
const path = require("node:path");

const workspace = path.resolve(__dirname, "..");
const dataPath = path.join(workspace, "backend", "src", "data", "campus-route-segments.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const restrictedRing = [
  [106.78055, 10.88438],
  [106.78095, 10.88465],
  [106.78132, 10.88437],
  [106.78142, 10.88375],
  [106.7811, 10.88338],
  [106.78072, 10.8836],
];
const depot = [106.781156, 10.883162];

const pointKey = ([longitude, latitude]) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
const distanceMeters = (from, to) => Math.hypot((from[0] - to[0]) * 109300, (from[1] - to[1]) * 111000);
const orientation = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function pointInsidePolygon(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a, b, c, d) {
  const epsilon = 1e-12;
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return (Math.abs(o1) < epsilon || Math.abs(o2) < epsilon || o1 * o2 < 0) &&
    (Math.abs(o3) < epsilon || Math.abs(o4) < epsilon || o3 * o4 < 0);
}

function blockedEdge(from, to) {
  return pointInsidePolygon(from, restrictedRing) ||
    pointInsidePolygon(to, restrictedRing) ||
    restrictedRing.some((point, index) => segmentsIntersect(from, to, point, restrictedRing[(index + 1) % restrictedRing.length]));
}

const coordinatesByKey = new Map();
const graph = new Map();

function addEdge(from, to, seconds) {
  const fromKey = pointKey(from);
  const toKey = pointKey(to);
  coordinatesByKey.set(fromKey, from);
  coordinatesByKey.set(toKey, to);
  for (const [source, destination] of [[fromKey, toKey], [toKey, fromKey]]) {
    const edges = graph.get(source) ?? [];
    const existing = edges.find((edge) => edge.destination === destination);
    if (existing) existing.seconds = Math.min(existing.seconds, seconds);
    else edges.push({ destination, meters: distanceMeters(from, to), seconds });
    graph.set(source, edges);
  }
}

for (const segment of data.segments) {
  const coordinates = segment.geometry.coordinates;
  const lengths = coordinates.slice(1).map((coordinate, index) => distanceMeters(coordinates[index], coordinate));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  coordinates.slice(1).forEach((to, index) => {
    const from = coordinates[index];
    if (blockedEdge(from, to)) return;
    addEdge(from, to, Math.max(0.25, segment.travelSeconds * lengths[index] / totalLength));
  });
}

function shortestPath(from, to) {
  const start = pointKey(from);
  const finish = pointKey(to);
  if (!graph.has(start) || !graph.has(finish)) throw new Error(`Access graph is missing ${start} or ${finish}`);
  const unvisited = new Set(graph.keys());
  const distances = new Map([[start, 0]]);
  const previous = new Map();
  while (unvisited.size) {
    let current;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const candidate of unvisited) {
      const candidateDistance = distances.get(candidate) ?? Number.POSITIVE_INFINITY;
      if (candidateDistance < currentDistance) {
        current = candidate;
        currentDistance = candidateDistance;
      }
    }
    if (!current || current === finish) break;
    unvisited.delete(current);
    for (const edge of graph.get(current) ?? []) {
      if (!unvisited.has(edge.destination)) continue;
      const nextDistance = currentDistance + edge.meters;
      if (nextDistance < (distances.get(edge.destination) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.destination, nextDistance);
        previous.set(edge.destination, current);
      }
    }
  }
  if (!distances.has(finish)) throw new Error(`No accessible route from ${start} to ${finish}`);
  const keys = [];
  for (let current = finish; current; current = previous.get(current)) {
    keys.push(current);
    if (current === start) break;
  }
  keys.reverse();
  const coordinates = keys.map((key) => coordinatesByKey.get(key));
  let travelSeconds = 0;
  for (let index = 1; index < keys.length; index += 1) {
    const edge = graph.get(keys[index - 1]).find((candidate) => candidate.destination === keys[index]);
    travelSeconds += edge.seconds;
  }
  return { coordinates, distanceMeters: Math.round(distances.get(finish)), travelSeconds: Math.max(1, Math.round(travelSeconds)) };
}

const depotLocation = data.locations.find((location) => location.id === "CAMPUS_DEPOT");
depotLocation.longitude = depot[0];
depotLocation.latitude = depot[1];

const locations = data.locations.map((location) => ({
  id: location.id,
  coordinate: [location.longitude, location.latitude],
}));
const segments = [];
for (let fromIndex = 0; fromIndex < locations.length; fromIndex += 1) {
  for (let toIndex = fromIndex + 1; toIndex < locations.length; toIndex += 1) {
    const from = locations[fromIndex];
    const to = locations[toIndex];
    const route = shortestPath(from.coordinate, to.coordinate);
    segments.push({
      id: `${from.id.toLowerCase()}-to-${to.id.toLowerCase()}`,
      fromLocationId: from.id,
      toLocationId: to.id,
      distanceMeters: route.distanceMeters,
      travelSeconds: route.travelSeconds,
      bidirectional: true,
      geometry: { type: "LineString", coordinates: route.coordinates },
    });
  }
}

data.version = 2;
data.generatedAt = "2026-07-19";
data.provenance = "OpenStreetMap-derived internal-road graph with operator-confirmed manual exclusions. The central park, pedestrian-only paths and closed perimeter gates are excluded from every courier route.";
data.routingPolicy.restrictedAreas = [{
  id: "central-park-pedestrian-zone",
  access: "NO_SHIPPER",
  reason: "Central park and its internal paths are not open to delivery vehicles; confirmed manually by the operator",
  geometry: {
    type: "Polygon",
    coordinates: [[...restrictedRing, restrictedRing[0]]],
  },
}];
data.segments = segments;

fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);
