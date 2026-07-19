export const Role = { ADMIN: 'ADMIN', STUDENT: 'STUDENT', MERCHANT: 'MERCHANT', SHIPPER: 'SHIPPER' } as const;
export type Role = typeof Role[keyof typeof Role];

export const MerchantStatus = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' } as const;
export type MerchantStatus = typeof MerchantStatus[keyof typeof MerchantStatus];

export const OrderStatus = {
  CREATED: 'CREATED', CONFIRMED: 'CONFIRMED', PREPARING: 'PREPARING', READY: 'READY',
  ASSIGNED_TO_TRIP: 'ASSIGNED_TO_TRIP', NOTIFIED_TO_COME_DOWN: 'NOTIFIED_TO_COME_DOWN',
  TEMP_WAITING: 'TEMP_WAITING', TEMP_WAITING_READY: 'TEMP_WAITING_READY',
  REDELIVERY_NEXT: 'REDELIVERY_NEXT', DELIVERED: 'DELIVERED', FAILED_DELIVERY: 'FAILED_DELIVERY', CANCELLED: 'CANCELLED'
} as const;
export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];

export const TripStatus = {
  DRAFT_GENERATING: 'DRAFT_GENERATING', AWAITING_SHIPPER_CONFIRMATION: 'AWAITING_SHIPPER_CONFIRMATION',
  STARTING: 'STARTING', IN_PROGRESS: 'IN_PROGRESS', REDELIVERY: 'REDELIVERY', COMPLETED: 'COMPLETED',
  GENERATION_FAILED: 'GENERATION_FAILED', CANCELLED_BEFORE_START: 'CANCELLED_BEFORE_START'
} as const;
export type TripStatus = typeof TripStatus[keyof typeof TripStatus];

export const StopStatus = {
  WAITING: 'WAITING', NEXT: 'NEXT', ARRIVED: 'ARRIVED', COMPLETED: 'COMPLETED',
  RETRY_WAITING: 'RETRY_WAITING', RETRY_NEXT: 'RETRY_NEXT', RETRY_ARRIVED: 'RETRY_ARRIVED', RETRY_COMPLETED: 'RETRY_COMPLETED'
} as const;

export const RecommendationStatus = { PROPOSED: 'PROPOSED', CONFIRMED: 'CONFIRMED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED', ACTIVATED: 'ACTIVATED' } as const;
export type RecommendationType = 'INITIAL' | 'RECALCULATION' | 'REDELIVERY';

export const restaurantTransitions: Record<string, OrderStatus> = {
  CREATED: OrderStatus.CONFIRMED, CONFIRMED: OrderStatus.PREPARING, PREPARING: OrderStatus.READY
};

export const nowIso = () => new Date().toISOString();
export const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
