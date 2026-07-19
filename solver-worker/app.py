from __future__ import annotations

from typing import Any, Literal

from fastapi import FastAPI
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from pydantic import BaseModel, Field

app = FastAPI(title="Dormitory OR-Tools Solver Worker", version="1.0.0")


class Shipper(BaseModel):
    currentLatitude: float
    currentLongitude: float

class Building(BaseModel):
    buildingId: str
    pickupLatitude: float
    pickupLongitude: float

class Stop(BaseModel):
    stopId: str
    buildingId: str
    sequence: int
    status: str = "WAITING"
    temporarilyUnavailable: bool = False

class Order(BaseModel):
    buildingId: str
    minutesWaiting: float = 0
    freshnessRisk: Literal["LOW", "MEDIUM", "HIGH"] = "LOW"

class Snapshot(BaseModel):
    startLocationId: str
    shipper: Shipper
    buildings: list[Building]
    remainingStops: list[Stop]
    orders: list[Order] = []
    travelTimeMatrix: dict[str, dict[str, float]]

class Priority(BaseModel):
    buildingId: str
    priorityScore: float = Field(ge=0, le=100)

class Weights(BaseModel):
    travelTime: float = Field(default=1, ge=0)
    orderWaiting: float = Field(default=1, ge=0)
    freshnessRisk: float = Field(default=1, ge=0)
    buildingBatchValue: float = Field(default=1, ge=0)
    routeChangePenalty: float = Field(default=1, ge=0)

class Constraints(BaseModel):
    excludeUnavailableBuildingIds: list[str] = []

class Policy(BaseModel):
    buildingPriorities: list[Priority]
    objectiveWeights: Weights = Weights()
    hardConstraints: Constraints = Constraints()

class SolveRequest(BaseModel):
    snapshot: Snapshot
    policy: Policy
    timeLimitSeconds: int = Field(default=2, ge=1, le=10)


class SolveResponse(BaseModel):
    status: Literal["FEASIBLE", "INFEASIBLE", "TIME_LIMIT"]
    orderedStopIds: list[str]
    orderedBuildingIds: list[str]
    estimatedTravelMinutes: float
    estimatedServiceMinutes: float
    objectiveScore: float


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ortools-solver"}


@app.post("/solve", response_model=SolveResponse)
def solve(body: SolveRequest) -> SolveResponse:
    snapshot, policy = body.snapshot, body.policy
    stops = snapshot.remainingStops
    if not stops:
        return SolveResponse(status="FEASIBLE", orderedStopIds=[], orderedBuildingIds=[], estimatedTravelMinutes=0, estimatedServiceMinutes=0, objectiveScore=0)
    buildings = {b.buildingId: b for b in snapshot.buildings}
    if any(s.buildingId not in buildings for s in stops):
        return SolveResponse(status="INFEASIBLE", orderedStopIds=[], orderedBuildingIds=[], estimatedTravelMinutes=0, estimatedServiceMinutes=0, objectiveScore=0)

    count = len(stops) + 1  # node 0 is the current shipper position
    manager = pywrapcp.RoutingIndexManager(count, 1, 0)
    routing = pywrapcp.RoutingModel(manager)
    priorities = {p.buildingId: p.priorityScore for p in policy.buildingPriorities}
    unavailable = set(policy.hardConstraints.excludeUnavailableBuildingIds)
    matrix, weights = snapshot.travelTimeMatrix, policy.objectiveWeights
    required_nodes = [snapshot.startLocationId, *[stop.buildingId for stop in stops]]
    if any(target not in matrix.get(source, {}) for source in required_nodes for target in required_nodes):
        return SolveResponse(status="INFEASIBLE", orderedStopIds=[], orderedBuildingIds=[], estimatedTravelMinutes=0, estimatedServiceMinutes=0, objectiveScore=0)
    order_groups = {stop.buildingId: [order for order in snapshot.orders if order.buildingId == stop.buildingId] for stop in stops}
    waits = {key: max([o.minutesWaiting for o in value], default=0) for key, value in order_groups.items()}
    risks = {key: max([{"LOW": 1, "MEDIUM": 2, "HIGH": 3}[o.freshnessRisk] for o in value], default=0) for key, value in order_groups.items()}
    batches = {key: len(value) for key, value in order_groups.items()}
    max_wait, max_risk, max_batch = max(waits.values(), default=0), max(risks.values(), default=0), max(batches.values(), default=0)
    original_sequence = {stop.buildingId: stop.sequence for stop in stops}

    def cost(from_index: int, to_index: int) -> int:
        source, target = manager.IndexToNode(from_index), manager.IndexToNode(to_index)
        if target == 0:
            return 0
        target_building = stops[target - 1].buildingId
        if source == 0:
            travel = int(round(float(matrix[snapshot.startLocationId][target_building])))
            route_change = 0
        else:
            source_building = stops[source - 1].buildingId
            travel = int(round(float(matrix[source_building][target_building])))
            route_change = 0 if original_sequence[target_building] == original_sequence[source_building] + 1 else 1
        policy_priority_penalty = max(0, 100 - priorities.get(target_building, 0))
        wait_penalty = max_wait - waits[target_building]
        freshness_penalty = max_risk - risks[target_building]
        batch_penalty = max_batch - batches[target_building]
        unavailable_penalty = 10_000 if target_building in unavailable else 0
        weighted = travel * weights.travelTime + wait_penalty * weights.orderWaiting + freshness_penalty * 10 * weights.freshnessRisk + batch_penalty * 10 * weights.buildingBatchValue + route_change * 10 * weights.routeChangePenalty + policy_priority_penalty
        return max(0, int(round(weighted * 100)) + unavailable_penalty)

    transit = routing.RegisterTransitCallback(cost)
    routing.SetArcCostEvaluatorOfAllVehicles(transit)
    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = body.timeLimitSeconds
    solution = routing.SolveWithParameters(params)
    if solution is None:
        return SolveResponse(status="INFEASIBLE", orderedStopIds=[], orderedBuildingIds=[], estimatedTravelMinutes=0, estimatedServiceMinutes=0, objectiveScore=0)

    ordered: list[dict[str, Any]] = []
    index = routing.Start(0)
    objective = 0
    while not routing.IsEnd(index):
        next_index = solution.Value(routing.NextVar(index))
        objective += routing.GetArcCostForVehicle(index, next_index, 0)
        node = manager.IndexToNode(next_index)
        if node != 0:
            ordered.append(stops[node - 1])
        index = next_index
    travel = 0.0
    for position, stop in enumerate(ordered):
        if position == 0:
            travel += float(matrix[snapshot.startLocationId][stop.buildingId])
        else:
            previous = ordered[position - 1].buildingId
            travel += float(matrix[previous][stop.buildingId])
    return SolveResponse(status="FEASIBLE", orderedStopIds=[s.stopId for s in ordered], orderedBuildingIds=[s.buildingId for s in ordered], estimatedTravelMinutes=travel, estimatedServiceMinutes=len(ordered) * 3, objectiveScore=float(objective))
