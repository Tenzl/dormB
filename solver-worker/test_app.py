from fastapi.testclient import TestClient
from app import app


def test_health_and_solve_every_stop_once():
    client = TestClient(app)
    assert client.get("/health").json()["status"] == "ok"
    snapshot = {
        "startLocationId": "DEPOT",
        "shipper": {"currentLatitude": 10.0, "currentLongitude": 106.0},
        "buildings": [
            {"buildingId": "a", "pickupLatitude": 10.001, "pickupLongitude": 106.001},
            {"buildingId": "b", "pickupLatitude": 10.002, "pickupLongitude": 106.002},
        ],
        "remainingStops": [{"stopId": "s1", "buildingId": "a", "sequence": 1}, {"stopId": "s2", "buildingId": "b", "sequence": 2}],
        "orders": [{"buildingId": "a", "minutesWaiting": 20, "freshnessRisk": "HIGH"}, {"buildingId": "b", "minutesWaiting": 2, "freshnessRisk": "LOW"}],
        "travelTimeMatrix": {
            "DEPOT": {"DEPOT": 0, "a": 2, "b": 4},
            "a": {"DEPOT": 2, "a": 0, "b": 3},
            "b": {"DEPOT": 4, "a": 3, "b": 0},
        },
    }
    policy = {"buildingPriorities": [{"buildingId": "a", "priorityScore": 90}, {"buildingId": "b", "priorityScore": 30}], "objectiveWeights": {"travelTime": 1, "orderWaiting": 2, "freshnessRisk": 2, "buildingBatchValue": 1, "routeChangePenalty": 1}, "hardConstraints": {"excludeUnavailableBuildingIds": []}}
    result = client.post("/solve", json={"snapshot": snapshot, "policy": policy, "timeLimitSeconds": 1})
    assert result.status_code == 200
    assert set(result.json()["orderedStopIds"]) == {"s1", "s2"}
