# Hướng dẫn triển khai bản đồ KTX thật, route đầy đủ, mock GPS và OR-Tools

**Mục tiêu:** Hiển thị bản đồ thật của KTX Khu B, bổ sung dữ liệu tòa/pickup point của ứng dụng, vẽ toàn bộ đường đi bám theo đường nội bộ, hiển thị shipper di chuyển, hỗ trợ zoom/pan và dùng OR-Tools để chọn thứ tự giao hàng.

**Phạm vi MVP:** 4 ngày hackathon, 1 merchant, 1 shipper, khoảng 4–6 tòa, 10–15 đơn hàng, mock GPS deterministic.

---

## 1. Quyết định kiến trúc

Sử dụng kiến trúc sau:

```text
OpenStreetMap/OpenFreeMap basemap
                │
                ▼
       MapLibre GL JS
    bản đồ thật + zoom/pan
                │
     ┌──────────┼───────────┐
     ▼          ▼           ▼
Building     Delivery     Shipper
markers      route        marker
                 ▲
                 │ GeoJSON LineString
                 │
        Route geometry service
                 ▲
                 │ ordered building IDs
                 │
              OR-Tools
                 ▲
                 │ time/cost matrix
                 │
       Campus route segments
                 ▲
                 │
              GPT-5.6
       priority weights/reasons
```

### Phân chia trách nhiệm

| Thành phần | Trách nhiệm |
|---|---|
| MapLibre | Hiển thị basemap thật, zoom, pan, marker, route và overlay dữ liệu ứng dụng |
| Custom building data | Bổ sung tên tòa, pickup point, số đơn, trạng thái và ETA |
| Campus route segments | Lưu chi phí và hình dạng đường đi giữa các điểm quan trọng |
| GPT-5.6 | Phân tích độ ưu tiên của đơn/tòa và tạo objective weights |
| OR-Tools | Chọn thứ tự các building stop |
| Route geometry service | Ghép các đoạn đường thành một route GeoJSON hoàn chỉnh |
| Mock GPS service | Di chuyển marker dọc theo route geometry |
| Socket.IO | Phát vị trí và trạng thái trip theo thời gian thực |

### Vì sao không dùng Canvas/Konva làm bản đồ chính?

Canvas/Konva phù hợp với sơ đồ tự vẽ, nhưng sẽ phải tự xây:

- Zoom và pan.
- Quy đổi longitude/latitude.
- Marker và popup.
- Fit route vào viewport.
- Giới hạn vùng hiển thị.
- Basemap đường và tòa thật.

MapLibre đã render bằng WebGL trên canvas và cung cấp sẵn các chức năng trên. Canvas/Konva chỉ nên dùng nếu không cần bản đồ địa lý thật.

---

## 2. Những gì OR-Tools cần và không cần

OR-Tools không đọc ảnh bản đồ và không vẽ đường.

OR-Tools chỉ cần:

```text
1. Danh sách location/stop
2. Điểm bắt đầu hiện tại của shipper
3. Ma trận thời gian hoặc chi phí giữa các location
4. Constraints
5. Priority/penalty
```

Ví dụ ma trận thời gian:

```json
{
  "CURRENT": {
    "CURRENT": 0,
    "C1": 90,
    "C3": 140,
    "D2": 210
  },
  "C1": {
    "CURRENT": 90,
    "C1": 0,
    "C3": 80,
    "D2": 150
  },
  "C3": {
    "CURRENT": 140,
    "C1": 80,
    "C3": 0,
    "D2": 95
  },
  "D2": {
    "CURRENT": 210,
    "C1": 150,
    "C3": 95,
    "D2": 0
  }
}
```

OR-Tools trả về:

```text
CURRENT → C3 → D2 → C1
```

Để hiển thị một tuyến đường đầy đủ, ứng dụng phải lấy geometry cho:

```text
CURRENT → C3
C3 → D2
D2 → C1
```

rồi ghép chúng thành một `GeoJSON LineString`.

---

## 3. Dữ liệu cần chuẩn bị

## 3.1 Building và pickup point

Không nên dùng tâm của tòa nhà làm điểm giao. Mỗi tòa cần một pickup point nằm trên hoặc sát đường nội bộ.

```ts
export type DormitoryBuilding = {
  id: string;
  code: string;
  name: string;

  center: {
    longitude: number;
    latitude: number;
  };

  pickupPoint: {
    longitude: number;
    latitude: number;
    name: string;
  };
};
```

Ví dụ cấu trúc dữ liệu:

```json
{
  "id": "building-c1",
  "code": "C1",
  "name": "Tòa C1",
  "center": {
    "longitude": 0,
    "latitude": 0
  },
  "pickupPoint": {
    "longitude": 0,
    "latitude": 0,
    "name": "Điểm nhận hàng phía trước C1"
  }
}
```

Không dùng tọa độ ví dụ trong tài liệu cho production. Tọa độ phải được lấy trực tiếp trên bản đồ thật.

## 3.2 Campus location

Mọi điểm mà OR-Tools có thể xem là một location nên có ID ổn định:

```ts
export type CampusLocation = {
  id: string;
  type:
    | "SHIPPER_START"
    | "BUILDING_PICKUP"
    | "ROAD_ANCHOR";
  longitude: number;
  latitude: number;
};
```

Trong MVP, các location chính gồm:

```text
CURRENT
C1
C3
D2
E1
F1
```

`CURRENT` được tạo động từ mock GPS hiện tại.

## 3.3 Campus route segment

Một route segment là toàn bộ đường đi từ một location quan trọng đến location khác.

```ts
export type CampusRouteSegment = {
  id: string;

  fromLocationId: string;
  toLocationId: string;

  distanceMeters: number;
  travelSeconds: number;

  bidirectional: boolean;

  geometry: {
    type: "LineString";
    coordinates: Array<
      [longitude: number, latitude: number]
    >;
  };
};
```

Ví dụ:

```json
{
  "id": "c1-to-c3",
  "fromLocationId": "C1",
  "toLocationId": "C3",
  "distanceMeters": 0,
  "travelSeconds": 0,
  "bidirectional": true,
  "geometry": {
    "type": "LineString",
    "coordinates": []
  }
}
```

Geometry phải chứa nhiều điểm nằm dọc theo đường, không chỉ điểm đầu và cuối.

## 3.4 Vì sao lưu segment giữa từng cặp?

Với 5 tòa, số cặp không hướng tối đa là:

```text
5 × 4 / 2 = 10 cặp
```

Thêm một số điểm bắt đầu/cổng vẫn nằm trong quy mô nhỏ.

Cách này đơn giản hơn:

- Không cần chạy OSRM trong lúc demo.
- Không cần tự xây routing engine đầy đủ.
- Dữ liệu ổn định và có thể commit vào GitHub.
- OR-Tools vẫn thay đổi thứ tự tòa tùy trạng thái đơn.
- Route vẫn bám đúng đường thật.

---

## 4. Cách lấy dữ liệu đường

Có hai phương án.

## 4.1 Phương án khuyến nghị: lấy từ routing service một lần rồi lưu local

Quy trình:

```text
Chọn pickup points
→ gọi routing service giữa từng cặp
→ nhận distance, duration, geometry
→ kiểm tra route trên bản đồ
→ sửa thủ công nếu cần
→ lưu JSON/DB
→ runtime chỉ đọc dữ liệu local
```

Có thể sử dụng một routing engine dựa trên OpenStreetMap trong giai đoạn chuẩn bị dữ liệu. Runtime của MVP không phụ thuộc vào dịch vụ đó.

Ưu điểm:

- Geometry được tạo nhanh.
- Đường thường bám theo mạng đường OSM.
- Có sẵn distance và duration.

Hạn chế:

- Một số đường nội bộ hoặc lối đi nhỏ có thể thiếu.
- Có thể chọn nhầm đường dành cho ô tô thay vì xe máy/đi bộ.
- Cần kiểm tra từng segment.

## 4.2 Phương án dự phòng: vẽ route thủ công trên bản đồ

Tạo một trang nội bộ:

```text
/admin/campus-route-editor
```

Luồng:

1. Chọn `fromLocation`.
2. Chọn `toLocation`.
3. Click các điểm dọc theo đường nội bộ.
4. Xem trước đường.
5. Nhập hoặc tính `travelSeconds`.
6. Lưu thành `CampusRouteSegment`.

Giao diện tối thiểu:

```text
From: C1
To: C3

[Start drawing]
[Undo point]
[Clear]
[Save segment]
```

Mỗi click trả về:

```ts
map.on("click", (event) => {
  const coordinate = [
    event.lngLat.lng,
    event.lngLat.lat,
  ];
});
```

### Lưu file cho hackathon

```text
apps/web/public/data/campus-buildings.json
apps/web/public/data/campus-route-segments.json
```

Hoặc đặt trong backend:

```text
apps/api/src/seed/campus-buildings.json
apps/api/src/seed/campus-route-segments.json
```

---

## 5. Cài đặt MapLibre trong Next.js

Cài package:

```bash
npm install maplibre-gl react-map-gl
```

Import CSS:

```tsx
import "maplibre-gl/dist/maplibre-gl.css";
```

Component cơ bản:

```tsx
"use client";

import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
} from "react-map-gl/maplibre";

import "maplibre-gl/dist/maplibre-gl.css";

export function CampusDeliveryMap() {
  return (
    <div className="h-[600px] w-full overflow-hidden rounded-2xl">
      <Map
        initialViewState={{
          longitude: YOUR_CENTER_LONGITUDE,
          latitude: YOUR_CENTER_LATITUDE,
          zoom: 16.5,
        }}
        minZoom={15}
        maxZoom={20}
        maxBounds={[
          [WEST_LONGITUDE, SOUTH_LATITUDE],
          [EAST_LONGITUDE, NORTH_LATITUDE],
        ]}
        mapStyle={YOUR_MAP_STYLE_URL}
      >
        <NavigationControl position="top-right" />
      </Map>
    </div>
  );
}
```

### Các thiết lập cần chốt

```text
minZoom: 15–16
maxZoom: 20
maxBounds: KTX Khu B + padding
dragRotate: false
touchPitch: false
```

Không khóa `maxBounds` quá sát tòa nhà. Nên chừa khoảng đệm để pan/zoom không bị giật.

---

## 6. Hiển thị tòa và pickup point

### Dùng Marker cho MVP

```tsx
type BuildingMarkerProps = {
  code: string;
  longitude: number;
  latitude: number;
  orderCount: number;
  sequence?: number;
};

function BuildingMarker({
  code,
  longitude,
  latitude,
  orderCount,
  sequence,
}: BuildingMarkerProps) {
  return (
    <Marker
      longitude={longitude}
      latitude={latitude}
      anchor="bottom"
    >
      <button
        type="button"
        className="rounded-xl border bg-white px-3 py-2 shadow"
      >
        <strong>
          {sequence ? `${sequence}. ` : ""}
          {code}
        </strong>
        <div className="text-xs">
          {orderCount} orders
        </div>
      </button>
    </Marker>
  );
}
```

### Dùng GeoJSON nếu có nhiều marker

Khi cần render nhiều tòa, chuyển sang `GeoJSON Source + Symbol/Circle Layer`.

```ts
const buildingGeoJson = {
  type: "FeatureCollection",
  features: buildings.map((building) => ({
    type: "Feature",
    properties: {
      id: building.id,
      code: building.code,
      orderCount: building.orderCount,
    },
    geometry: {
      type: "Point",
      coordinates: [
        building.pickupPoint.longitude,
        building.pickupPoint.latitude,
      ],
    },
  })),
};
```

---

## 7. Tạo travel-time matrix cho OR-Tools

## 7.1 Từ route segments

```ts
type TravelMatrix =
  Record<string, Record<string, number>>;

export function buildTravelTimeMatrix(
  locationIds: string[],
  segments: CampusRouteSegment[],
): TravelMatrix {
  const matrix: TravelMatrix = {};

  for (const fromId of locationIds) {
    matrix[fromId] = {};

    for (const toId of locationIds) {
      if (fromId === toId) {
        matrix[fromId][toId] = 0;
        continue;
      }

      const segment = segments.find((item) => {
        const direct =
          item.fromLocationId === fromId &&
          item.toLocationId === toId;

        const reverse =
          item.bidirectional &&
          item.fromLocationId === toId &&
          item.toLocationId === fromId;

        return direct || reverse;
      });

      if (!segment) {
        throw new Error(
          `Missing route segment: ${fromId} -> ${toId}`,
        );
      }

      matrix[fromId][toId] = segment.travelSeconds;
    }
  }

  return matrix;
}
```

## 7.2 Vị trí `CURRENT`

Mock GPS hiện tại có thể không trùng pickup point.

Có hai cách.

### Cách A — Snap về anchor gần nhất

```text
Current mock GPS
→ tìm pickup/road anchor gần nhất
→ dùng anchor đó làm depot cho OR-Tools
```

Đây là phương án dễ nhất cho MVP.

### Cách B — Tạo dynamic segment từ current point

```text
Current point
→ cắt remaining route geometry
→ tính cost đến từng tòa
```

Cách này chính xác hơn nhưng phức tạp hơn. MVP nên dùng cách A.

---

## 8. GPT-5.6 tạo priority policy

GPT-5.6 không trả thứ tự route cuối cùng.

Input:

```ts
type OrderRoutingContext = {
  orderId: string;
  buildingId: string;
  minutesWaiting: number;
  freshnessRisk: "LOW" | "MEDIUM" | "HIGH";
  foodCategory: string;
  deliveryAttempt: 1 | 2;
};
```

Output:

```ts
type OptimizationPolicy = {
  buildingPriorities: Array<{
    buildingId: string;
    priorityScore: number;
    reasons: string[];
  }>;

  objectiveWeights: {
    travelTime: number;
    orderWaiting: number;
    freshnessRisk: number;
    buildingBatchValue: number;
    routeChangePenalty: number;
  };

  explanation: string[];
};
```

Ví dụ:

```json
{
  "buildingPriorities": [
    {
      "buildingId": "C3",
      "priorityScore": 92,
      "reasons": [
        "Three high-freshness-risk drinks",
        "Average waiting time is 18 minutes"
      ]
    }
  ],
  "objectiveWeights": {
    "travelTime": 0.35,
    "orderWaiting": 0.25,
    "freshnessRisk": 0.25,
    "buildingBatchValue": 0.1,
    "routeChangePenalty": 0.05
  },
  "explanation": [
    "Prioritize C3 without creating a large travel detour."
  ]
}
```

Backend phải validate mọi building ID và giá trị weight.

---

## 9. OR-Tools service

Vì OR-Tools có binding chính thức cho Python, kiến trúc nhanh nhất là:

```text
NestJS
→ HTTP internal request
→ FastAPI
→ OR-Tools
```

### Request

```ts
type OptimizeRouteRequest = {
  locationIds: string[];
  startLocationId: string;
  travelTimeMatrix: number[][];
  buildingPriorityPenalties: number[];
  fixedPrefixLocationIds: string[];
  solveTimeLimitSeconds: number;
};
```

### Response

```ts
type OptimizeRouteResponse = {
  status: "FEASIBLE" | "INFEASIBLE" | "TIME_LIMIT";
  orderedLocationIds: string[];
  totalTravelSeconds: number;
  objectiveScore: number;
};
```

### Python skeleton

```python
from ortools.constraint_solver import (
    pywrapcp,
    routing_enums_pb2,
)


def solve_route(
    distance_matrix: list[list[int]],
    start_index: int,
    time_limit_seconds: int = 2,
) -> list[int]:
    node_count = len(distance_matrix)

    manager = pywrapcp.RoutingIndexManager(
        node_count,
        1,
        start_index,
    )

    routing = pywrapcp.RoutingModel(manager)

    def transit_callback(
        from_index: int,
        to_index: int,
    ) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)

        return distance_matrix[from_node][to_node]

    callback_index = routing.RegisterTransitCallback(
        transit_callback,
    )

    routing.SetArcCostEvaluatorOfAllVehicles(
        callback_index,
    )

    search = pywrapcp.DefaultRoutingSearchParameters()

    search.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy
        .PATH_CHEAPEST_ARC
    )

    search.local_search_metaheuristic = (
        routing_enums_pb2
        .LocalSearchMetaheuristic
        .GUIDED_LOCAL_SEARCH
    )

    search.time_limit.seconds = time_limit_seconds

    solution = routing.SolveWithParameters(search)

    if solution is None:
        raise RuntimeError("No feasible route")

    route: list[int] = []
    index = routing.Start(0)

    while not routing.IsEnd(index):
        route.append(manager.IndexToNode(index))
        index = solution.Value(routing.NextVar(index))

    return route
```

### Lưu ý về return-to-depot

Luồng giao hàng của MVP không nhất thiết quay lại điểm xuất phát.

Khi triển khai, cần cấu hình start/end phù hợp thay vì mặc định TSP vòng tròn. Không được để route tự nối tòa cuối về `CURRENT` nếu nghiệp vụ không yêu cầu.

---

## 10. Chuyển thứ tự OR-Tools thành đường hoàn chỉnh

OR-Tools trả:

```text
CURRENT → C3 → D2 → C1
```

Hàm ghép geometry:

```ts
type Coordinate = [number, number];

function reverseCoordinates(
  coordinates: Coordinate[],
): Coordinate[] {
  return [...coordinates].reverse();
}

function getSegmentCoordinates(
  fromId: string,
  toId: string,
  segments: CampusRouteSegment[],
): Coordinate[] {
  const direct = segments.find(
    (segment) =>
      segment.fromLocationId === fromId &&
      segment.toLocationId === toId,
  );

  if (direct) {
    return direct.geometry.coordinates;
  }

  const reverse = segments.find(
    (segment) =>
      segment.bidirectional &&
      segment.fromLocationId === toId &&
      segment.toLocationId === fromId,
  );

  if (reverse) {
    return reverseCoordinates(
      reverse.geometry.coordinates,
    );
  }

  throw new Error(
    `Missing geometry: ${fromId} -> ${toId}`,
  );
}

export function buildCompleteRoute(
  orderedLocationIds: string[],
  segments: CampusRouteSegment[],
) {
  const coordinates: Coordinate[] = [];

  for (
    let index = 0;
    index < orderedLocationIds.length - 1;
    index += 1
  ) {
    const fromId = orderedLocationIds[index];
    const toId = orderedLocationIds[index + 1];

    const segmentCoordinates = getSegmentCoordinates(
      fromId,
      toId,
      segments,
    );

    if (coordinates.length === 0) {
      coordinates.push(...segmentCoordinates);
    } else {
      coordinates.push(
        ...segmentCoordinates.slice(1),
      );
    }
  }

  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates,
    },
  };
}
```

`slice(1)` tránh lặp tọa độ tại điểm nối.

---

## 11. Vẽ route đẹp bằng MapLibre

Tạo hai lớp chồng nhau:

```tsx
const routeOutlineLayer = {
  id: "delivery-route-outline",
  type: "line" as const,
  layout: {
    "line-cap": "round" as const,
    "line-join": "round" as const,
  },
  paint: {
    "line-color": "#ffffff",
    "line-width": 12,
    "line-opacity": 0.95,
  },
};

const routeMainLayer = {
  id: "delivery-route-main",
  type: "line" as const,
  layout: {
    "line-cap": "round" as const,
    "line-join": "round" as const,
  },
  paint: {
    "line-color": "#2563eb",
    "line-width": 7,
    "line-opacity": 1,
  },
};
```

Render:

```tsx
<Source
  id="delivery-route"
  type="geojson"
  data={routeGeoJson}
>
  <Layer {...routeOutlineLayer} />
  <Layer {...routeMainLayer} />
</Source>
```

### Chia route theo tiến độ

Nên có ba source hoặc feature:

```text
completed-route
active-segment
remaining-route
```

Style:

```text
Completed: xám
Active: xanh đậm
Remaining: xanh nhạt
```

---

## 12. Mock GPS chạy dọc theo đường

Không tạo mock GPS tùy ý.

Nguồn duy nhất phải là `completeRoute.geometry.coordinates`.

```text
Route geometry
→ tính khoảng cách mỗi đoạn
→ xác định điểm theo progress
→ phát location mỗi 5 giây
```

## 12.1 Trạng thái mock

```ts
export type MockLocationState = {
  tripId: string;
  routeVersion: number;

  progressRatio: number;
  coordinateIndex: number;

  longitude: number;
  latitude: number;

  heading: number;
  playbackStatus:
    | "IDLE"
    | "PLAYING"
    | "PAUSED"
    | "COMPLETED";

  recordedAt: string;
};
```

## 12.2 Socket event

```text
mock-location.updated
```

Payload:

```ts
export type MockLocationUpdatedEvent = {
  tripId: string;
  routeVersion: number;
  longitude: number;
  latitude: number;
  heading: number;
  progressRatio: number;
  recordedAt: string;
};
```

## 12.3 Marker

```tsx
function ShipperMarker({
  longitude,
  latitude,
  heading,
}: {
  longitude: number;
  latitude: number;
  heading: number;
}) {
  return (
    <Marker
      longitude={longitude}
      latitude={latitude}
      anchor="center"
      rotation={heading}
    >
      <div className="relative">
        <div className="absolute -inset-3 animate-ping rounded-full bg-blue-500/20" />

        <div className="relative flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-blue-600 shadow">
          🛵
        </div>
      </div>
    </Marker>
  );
}
```

### Frontend interpolation

Backend phát mỗi 5 giây, frontend animate trong khoảng 4–5 giây để marker không nhảy.

Có thể nội suy tuyến tính giữa hai vị trí gần nhau. Không nội suy thẳng qua khoảng cách lớn hoặc qua hai segment không liên tiếp.

---

## 13. Fit route vào viewport

Khi route được tạo hoặc thay đổi:

```text
Route coordinates
→ tính bounding box
→ map.fitBounds()
```

Pseudo-code:

```ts
const bounds = coordinates.reduce(
  (currentBounds, coordinate) => {
    return currentBounds.extend(coordinate);
  },
  new LngLatBounds(
    coordinates[0],
    coordinates[0],
  ),
);

map.fitBounds(bounds, {
  padding: 60,
  duration: 800,
});
```

Không tự fit sau mỗi mock GPS update vì sẽ làm viewport giật liên tục.

---

## 14. Khi route được tính lại

Ví dụ:

```text
Route cũ:
CURRENT → C3 → D2 → C1

Route mới:
CURRENT → D2 → C3 → C1
```

Luồng:

```text
Shipper bấm Recalculate
→ backend lấy mock location hiện tại
→ snap vào route anchor
→ current/completed stops bị khóa
→ GPT-5.6 cập nhật priorities
→ OR-Tools tính remaining stop order
→ backend ghép geometry mới
→ shipper xem route comparison
→ shipper Confirm
→ countdown 5 giây
→ routeVersion tăng
→ mock playback tiếp tục trên geometry mới
```

### Quy tắc bắt buộc

- Không xóa completed stop.
- Không đổi current `ARRIVED` stop.
- Không thêm order mới vào active trip.
- Không chạy lại AI sau mỗi GPS update.
- Không đổi route nếu shipper chưa confirm.
- Event mock cũ có `routeVersion` thấp hơn phải bị bỏ qua.

---

## 15. API đề xuất

## 15.1 Map data

```http
GET /campus/buildings
GET /campus/route-segments
```

## 15.2 Trip generation

```http
POST /shipper/trips/generate
```

Response:

```ts
type GenerateTripResponse = {
  tripId: string;
  recommendationId: string;

  orderedBuildingIds: string[];
  routeGeoJson: GeoJSON.Feature<
    GeoJSON.LineString
  >;

  estimatedTravelSeconds: number;
  explanation: string[];
};
```

## 15.3 Confirm route

```http
POST /shipper/route-recommendations/:id/confirm
POST /shipper/route-recommendations/:id/reject
```

## 15.4 Recalculate

```http
POST /shipper/trips/:tripId/recalculate
```

## 15.5 Mock playback

```http
POST /shipper/trips/:tripId/mock/start
POST /shipper/trips/:tripId/mock/pause
POST /shipper/trips/:tripId/mock/resume
POST /shipper/trips/:tripId/mock/advance
```

Các API mock chỉ được bật trong demo mode.

---

## 16. Data model gợi ý

```prisma
model Building {
  id                  String   @id
  code                String   @unique
  name                String

  centerLongitude     Float
  centerLatitude      Float

  pickupLongitude     Float
  pickupLatitude      Float
  pickupName          String

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model CampusRouteSegment {
  id                  String   @id
  fromLocationId      String
  toLocationId        String

  distanceMeters      Int
  travelSeconds       Int
  bidirectional       Boolean  @default(true)

  geometryJson        Json

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([fromLocationId, toLocationId])
}

model RouteRecommendation {
  id                  String   @id
  tripId              String

  recommendationType  String
  orderedLocations    Json
  routeGeoJson        Json

  policyJson          Json
  solverMetricsJson   Json
  explanationJson     Json

  status              String
  createdAt           DateTime @default(now())
  confirmedAt         DateTime?
  activatedAt         DateTime?
}

model MockLocationState {
  tripId              String   @id
  routeVersion        Int

  progressRatio       Float
  coordinateIndex     Int

  longitude           Float
  latitude            Float
  heading             Float

  playbackStatus      String
  recordedAt          DateTime
  updatedAt           DateTime @updatedAt
}
```

Với hackathon, `CampusRouteSegment` có thể được giữ trong JSON thay vì database.

---

## 17. Validation bắt buộc

## 17.1 Dữ liệu segment

Khi khởi động backend, kiểm tra:

- Không có segment thiếu `from` hoặc `to`.
- Geometry có ít nhất hai coordinate.
- Coordinate theo đúng thứ tự `[longitude, latitude]`.
- `travelSeconds > 0` với hai location khác nhau.
- Mọi cặp location mà solver cần đều có route.
- Segment hai chiều có thể reverse geometry chính xác.

## 17.2 Solver result

Kiểm tra:

- Mọi remaining stop xuất hiện đúng một lần.
- Không có stop từ trip khác.
- Không có stop trùng.
- Không thiếu stop.
- Current và completed stops không bị thay đổi.
- Route geometry ghép được hoàn chỉnh.
- Route không rỗng.
- Snapshot chưa hết hạn.

## 17.3 Mock GPS

Kiểm tra:

- Coordinate nằm trên route geometry.
- `routeVersion` khớp route hiện tại.
- Progress không giảm trừ khi reset demo.
- Không phát event sau khi trip completed.

---

## 18. Cấu trúc thư mục đề xuất

```text
apps/
├── web/
│   ├── app/
│   │   ├── student/tracking/
│   │   ├── shipper/trip/
│   │   └── admin/campus-route-editor/
│   │
│   ├── components/map/
│   │   ├── campus-delivery-map.tsx
│   │   ├── building-markers.tsx
│   │   ├── shipper-marker.tsx
│   │   ├── delivery-route-layer.tsx
│   │   └── route-fit-controller.tsx
│   │
│   └── public/data/
│       ├── campus-buildings.json
│       └── campus-route-segments.json
│
├── api/
│   └── src/
│       ├── campus/
│       ├── trips/
│       ├── routing/
│       │   ├── operational-snapshot.service.ts
│       │   ├── optimization-policy.service.ts
│       │   ├── travel-matrix.service.ts
│       │   ├── route-geometry.service.ts
│       │   └── route-validation.service.ts
│       │
│       ├── realtime/
│       └── mock-location/
│
└── optimizer/
    ├── app/
    │   ├── main.py
    │   ├── schemas.py
    │   └── solver.py
    └── requirements.txt
```

---

## 19. Demo flow

```text
1. Merchant chuyển 10–15 order sang READY.
2. Shipper bấm Ready to Deliver.
3. Backend lấy tất cả eligible READY orders.
4. Backend nhóm order theo building.
5. GPT-5.6 phân tích waiting time và freshness.
6. Travel matrix được tạo từ campus route segments.
7. OR-Tools trả thứ tự building.
8. Backend ghép full GeoJSON route.
9. MapLibre fit route vào viewport.
10. Shipper confirm route.
11. Countdown 5 giây.
12. Mock GPS marker chạy dọc đường thật.
13. Student xem marker, route, stop order và ETA.
14. Một stop bị delay hoặc unavailable.
15. Shipper bấm Recalculate.
16. OR-Tools tạo remaining route mới.
17. Shipper confirm.
18. Remaining route được thay trên bản đồ.
19. Primary route hoàn tất.
20. Redelivery route được tạo cho TEMP_WAITING_READY.
```

---

## 20. Scope cho bốn ngày

## Day 1

- MapLibre hiển thị KTX.
- Building/pickup data.
- Route segments JSON.
- Route layer và marker.
- Seed order/building data.

## Day 2

- Travel matrix.
- FastAPI + OR-Tools.
- GPT-5.6 policy.
- Trip generation.
- Route geometry concatenation.
- Route confirmation.

## Day 3

- Mock GPS playback.
- Socket.IO.
- Student tracking.
- Stop lifecycle.
- Route recalculation.
- Redelivery.

## Day 4

- Validation.
- Seed reset.
- Authorization.
- Demo script.
- Deployment/local setup.
- Fix lỗi.

Không xây routing engine tổng quát, PostGIS hay real GPS trong MVP.

---

## 21. Checklist hoàn thành

### Bản đồ

- [ ] Hiển thị đúng vùng KTX.
- [ ] Zoom/pan hoạt động.
- [ ] Không kéo map quá xa khỏi KTX.
- [ ] Có marker pickup point.
- [ ] Có tên tòa và số thứ tự stop.
- [ ] Route bám theo đường nội bộ.
- [ ] Route không xuyên qua tòa.

### OR-Tools

- [ ] Nhận travel-time matrix.
- [ ] Nhận start location.
- [ ] Trả mỗi stop đúng một lần.
- [ ] Có solve time limit.
- [ ] Không bắt buộc return-to-depot.
- [ ] Có deterministic fallback.

### Mock GPS

- [ ] Lấy coordinate từ route geometry.
- [ ] Phát update mỗi 5 giây.
- [ ] Marker di chuyển mượt.
- [ ] Reload vẫn giữ progress.
- [ ] Route version cũ bị bỏ qua.
- [ ] Reset demo hoạt động.

### Recalculation

- [ ] Current/completed stops bị khóa.
- [ ] Shipper xem current vs proposed route.
- [ ] Shipper phải confirm.
- [ ] Route mới chạy sau countdown 5 giây.
- [ ] Phần route đã đi không đổi.

---

## 22. Kết luận kỹ thuật

Lựa chọn cuối cùng:

```text
MapLibre
= visualization engine

GeoJSON LineString
= toàn bộ hình dạng đường

CampusRouteSegment
= dữ liệu distance, time và geometry

Travel-time matrix
= input cho OR-Tools

OR-Tools
= thứ tự building stops

GPT-5.6
= operational priorities và explanation

Mock GPS
= marker chạy dọc complete route geometry
```

Không dùng Canvas/Konva cho bản đồ chính. Không để OR-Tools tự vẽ đường. Không nối thẳng giữa các tòa. Không phụ thuộc routing API trong lúc demo.

Đây là kiến trúc phù hợp nhất để vừa có bản đồ KTX thật, vừa hiển thị shipper và toàn bộ tuyến đường, vừa hỗ trợ route optimization ổn định trong hackathon.

---

## 23. Tài liệu chính thức tham khảo

- MapLibre GL JS documentation: https://maplibre.org/maplibre-gl-js/docs/
- MapLibre GeoJSON line example: https://maplibre.org/maplibre-gl-js/docs/examples/add-a-geojson-line/
- MapLibre GeoJSONSource API: https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/
- react-map-gl MapLibre Source: https://visgl.github.io/react-map-gl/docs/api-reference/maplibre/source
- OR-Tools vehicle routing: https://developers.google.com/optimization/routing
- OR-Tools VRP guide: https://developers.google.com/optimization/routing/vrp
