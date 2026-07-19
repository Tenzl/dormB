import { boolean, doublePrecision, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
}

export const users = pgTable('users', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  phone: text('phone'), passwordHash: text('password_hash').notNull(), rolesJson: text('roles_json').notNull(),
  buildingId: text('building_id'), ...timestamps,
})
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(), createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [index('sessions_user_id_idx').on(table.userId)])
export const merchants = pgTable('merchants', {
  id: text('id').primaryKey(), ownerUserId: text('owner_user_id').notNull(), name: text('name').notNull(),
  description: text('description').notNull(), status: text('status').notNull().default('PENDING'),
  reviewedByUserId: text('reviewed_by_user_id'), reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'string' }), ...timestamps,
}, (table) => [index('merchants_owner_user_id_idx').on(table.ownerUserId), index('merchants_status_idx').on(table.status)])
export const buildings = pgTable('buildings', {
  id: text('id').primaryKey(), code: text('code').notNull().unique(), name: text('name').notNull(),
  pickupPointName: text('pickup_point_name').notNull(), pickupLatitude: doublePrecision('pickup_latitude').notNull(),
  pickupLongitude: doublePrecision('pickup_longitude').notNull(), mapXRatio: doublePrecision('map_x_ratio').notNull(), mapYRatio: doublePrecision('map_y_ratio').notNull(), ...timestamps,
})
export const products = pgTable('products', {
  id: text('id').primaryKey(), merchantId: text('merchant_id').notNull(), name: text('name').notNull(),
  price: integer('price').notNull(), category: text('category').notNull(), freshnessRisk: text('freshness_risk').notNull(),
  isAvailable: boolean('is_available').notNull(), ...timestamps,
}, (table) => [index('products_merchant_id_idx').on(table.merchantId)])
export const orders = pgTable('orders', {
  id: text('id').primaryKey(), studentId: text('student_id').notNull(), merchantId: text('merchant_id').notNull(),
  buildingId: text('building_id').notNull(), productId: text('product_id').notNull(), status: text('status').notNull(),
  readyAt: timestamp('ready_at', { withTimezone: true, mode: 'string' }), deliveryAttempt: integer('delivery_attempt').notNull().default(1), tripId: text('trip_id'), stopId: text('stop_id'), ...timestamps,
}, (table) => [index('orders_merchant_status_trip_idx').on(table.merchantId, table.status, table.tripId), index('orders_student_id_idx').on(table.studentId), index('orders_trip_id_idx').on(table.tripId)])
export const applications = pgTable('merchant_shipper_applications', {
  id: text('id').primaryKey(), studentId: text('student_id').notNull(), merchantId: text('merchant_id').notNull(),
  vehicleType: text('vehicle_type').notNull(), availability: text('availability').notNull(), experience: text('experience').notNull(),
  note: text('note'), status: text('status').notNull(), reviewedByUserId: text('reviewed_by_user_id'), reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'string' }), ...timestamps,
}, (table) => [index('applications_merchant_status_idx').on(table.merchantId, table.status)])
export const memberships = pgTable('merchant_shippers', {
  id: text('id').primaryKey(), studentId: text('student_id').notNull(), merchantId: text('merchant_id').notNull(),
  isActive: boolean('is_active').notNull(), approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'string' }).notNull(), deactivatedAt: timestamp('deactivated_at', { withTimezone: true, mode: 'string' }), ...timestamps,
}, (table) => [uniqueIndex('one_active_membership').on(table.studentId).where(sql`${table.isActive} = true`), index('memberships_merchant_id_idx').on(table.merchantId)])
export const trips = pgTable('delivery_trips', {
  id: text('id').primaryKey(), merchantId: text('merchant_id').notNull(), shipperStudentId: text('shipper_student_id').notNull(),
  status: text('status').notNull(), currentStopId: text('current_stop_id'), routeVersion: integer('route_version').notNull().default(1),
  countdownEndsAt: timestamp('countdown_ends_at', { withTimezone: true, mode: 'string' }), startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }), completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }), ...timestamps,
}, (table) => [index('trips_shipper_status_idx').on(table.shipperStudentId, table.status), index('trips_merchant_status_idx').on(table.merchantId, table.status)])
export const stops = pgTable('delivery_stops', {
  id: text('id').primaryKey(), tripId: text('trip_id').notNull(), buildingId: text('building_id').notNull(),
  sequence: integer('sequence').notNull(), passType: text('pass_type').notNull(), status: text('status').notNull(),
  temporarilyUnavailable: boolean('temporarily_unavailable').notNull().default(false),
  announcedAt: timestamp('announced_at', { withTimezone: true, mode: 'string' }), arrivedAt: timestamp('arrived_at', { withTimezone: true, mode: 'string' }), minimumWaitEndsAt: timestamp('minimum_wait_ends_at', { withTimezone: true, mode: 'string' }), completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }), ...timestamps,
}, (table) => [uniqueIndex('stops_trip_pass_building').on(table.tripId, table.passType, table.buildingId), index('stops_trip_sequence_idx').on(table.tripId, table.sequence)])
export const recommendations = pgTable('route_recommendations', {
  id: text('id').primaryKey(), tripId: text('trip_id').notNull(), recommendationType: text('recommendation_type').notNull(),
  snapshotJson: text('snapshot_json').notNull(), policyJson: text('policy_json').notNull(), currentRouteJson: text('current_route_json').notNull(),
  proposedRouteJson: text('proposed_route_json').notNull(), solverMetricsJson: text('solver_metrics_json').notNull(), explanationJson: text('explanation_json').notNull(),
  status: text('status').notNull(), createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(), confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'string' }), activatedAt: timestamp('activated_at', { withTimezone: true, mode: 'string' }),
}, (table) => [index('recommendations_trip_status_idx').on(table.tripId, table.status)])
export const mockWaypoints = pgTable('mock_gps_waypoints', {
  id: text('id').primaryKey(), routeKey: text('route_key').notNull(), waypointIndex: integer('waypoint_index').notNull(),
  latitude: doublePrecision('latitude').notNull(), longitude: doublePrecision('longitude').notNull(), mapXRatio: doublePrecision('map_x_ratio').notNull(),
  mapYRatio: doublePrecision('map_y_ratio').notNull(), offsetSeconds: integer('offset_seconds').notNull(),
})
export const mockLocations = pgTable('mock_location_states', {
  tripId: text('trip_id').primaryKey(), waypointIndex: integer('waypoint_index').notNull(), latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(), mapXRatio: doublePrecision('map_x_ratio').notNull(), mapYRatio: doublePrecision('map_y_ratio').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'string' }).notNull(), playbackStatus: text('playback_status').notNull(),
})
export const notifications = pgTable('in_app_notifications', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), tripId: text('trip_id'), stopId: text('stop_id'),
  type: text('type').notNull(), message: text('message').notNull(), deduplicationKey: text('deduplication_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(), readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
}, (table) => [index('notifications_user_created_idx').on(table.userId, table.createdAt)])
export const auditEvents = pgTable('audit_events', {
  id: text('id').primaryKey(), actorUserId: text('actor_user_id'), merchantId: text('merchant_id'), tripId: text('trip_id'),
  eventType: text('event_type').notNull(), payloadJson: text('payload_json').notNull(), createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [index('audit_merchant_created_idx').on(table.merchantId, table.createdAt), index('audit_trip_created_idx').on(table.tripId, table.createdAt)])
export const idempotencyRecords = pgTable('idempotency_records', {
  id: text('id').primaryKey(), actorUserId: text('actor_user_id').notNull(), action: text('action').notNull(), key: text('key').notNull(),
  requestHash: text('request_hash').notNull(), responseJson: text('response_json').notNull(), statusCode: integer('status_code').notNull(), createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [uniqueIndex('idempotency_actor_action_key').on(table.actorUserId, table.action, table.key)])
