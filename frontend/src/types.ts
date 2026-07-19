export type Role = "ADMIN" | "STUDENT" | "MERCHANT" | "SHIPPER";
export type MerchantStatus = "PENDING" | "APPROVED" | "REJECTED";
export type AsyncState = "idle" | "loading" | "success" | "error";
export type OrderStatus =
  | "CREATED"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "ASSIGNED_TO_TRIP"
  | "NOTIFIED_TO_COME_DOWN"
  | "TEMP_WAITING"
  | "TEMP_WAITING_READY"
  | "REDELIVERY_NEXT"
  | "DELIVERED"
  | "FAILED_DELIVERY";
export type TripStatus =
  | "DRAFT_GENERATING"
  | "AWAITING_SHIPPER_CONFIRMATION"
  | "STARTING"
  | "IN_PROGRESS"
  | "REDELIVERY"
  | "COMPLETED"
  | "GENERATION_FAILED"
  | "CANCELLED_BEFORE_START";
export type StopStatus =
  | "WAITING"
  | "NEXT"
  | "ARRIVED"
  | "COMPLETED"
  | "RETRY_WAITING"
  | "RETRY_NEXT"
  | "RETRY_ARRIVED"
  | "RETRY_COMPLETED";

export interface Session {
  userId: string;
  name: string;
  email?: string;
  roles: Role[];
  activeRole: Role;
  merchantId?: string;
  merchantStatus?: MerchantStatus;
  buildingId?: string;
}
export interface Building {
  id: string;
  code: string;
  name: string;
  pickupLabel: string;
  longitude: number;
  latitude: number;
  serviceable?: boolean;
  x?: number;
  y?: number;
}

export type Coordinate = [longitude: number, latitude: number];
export interface RouteLineFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "LineString"; coordinates: Coordinate[] };
}
export interface RouteSection {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  destinationStopId: string;
  distanceMeters: number;
  travelSeconds: number;
  geometry: RouteLineFeature;
}
export interface Merchant {
  id: string;
  name: string;
  description: string;
  prepMinutes: number;
  active: boolean;
  status: MerchantStatus;
  ownerName?: string;
  ownerEmail?: string;
}
export interface Product {
  id: string;
  merchantId: string;
  name: string;
  price?: number;
  category: string;
  description: string;
  available: boolean;
}
export interface Order {
  id: string;
  studentName: string;
  studentId: string;
  merchantId: string;
  buildingId: string;
  productName: string;
  productId?: string;
  status: OrderStatus;
  readyAt?: string;
  attempt: 1 | 2;
}
export interface ShipperApplication {
  id: string;
  studentId?: string;
  membershipId?: string;
  studentName: string;
  merchantId: string;
  vehicleType: string;
  availability: string;
  experience: string;
  note: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
}
export interface DeliveryStop {
  id: string;
  buildingId: string;
  sequence: number;
  status: StopStatus;
  orderIds: string[];
  unavailable?: boolean;
  announcedAt?: string;
  minimumWaitEndsAt?: string;
}
export interface Trip {
  id: string;
  recommendationId?: string;
  merchantId: string;
  shipperName: string;
  status: TripStatus;
  estimatedMinutes: number;
  remainingEstimatedMinutes?: number;
  stops: DeliveryStop[];
  currentStopId?: string;
  countdownEndsAt?: string;
  routeExplanation: string[];
  currentRoute?: string[];
  proposedRoute?: string[];
  recommendationType?: "INITIAL" | "RECALCULATION" | "REDELIVERY";
  routeVersion: number;
  routeGeoJson?: RouteLineFeature;
  routeSections: RouteSection[];
  proposedRouteGeoJson?: RouteLineFeature;
  proposedRouteSections?: RouteSection[];
  studentTracking?: {
    visible: boolean;
    locationVisible: boolean;
    routeVisible: boolean;
    state: "WAITING_FOR_ANNOUNCEMENT" | "ON_THE_WAY" | "ARRIVED";
    stopId?: string;
    buildingId?: string;
    announcedAt?: string;
  };
  gps: {
    longitude: number;
    latitude: number;
    heading: number;
    progressRatio: number;
    routeVersion: number;
    coordinateIndex?: number;
    playbackStatus?:
      | "ARMED"
      | "PLAYING"
      | "WAITING_AT_STOP"
      | "PAUSED"
      | "STOPPED"
      | "COMPLETED";
    updatedAt: string;
    x?: number;
    y?: number;
  };
}
export interface DemoState {
  merchants: Merchant[];
  products: Product[];
  buildings: Building[];
  orders: Order[];
  applications: ShipperApplication[];
  trip: Trip | null;
  trips?: Trip[];
}
