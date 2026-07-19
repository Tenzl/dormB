import { eq } from 'drizzle-orm';
import type { AppDb } from './db/index.js';
import { applications, auditEvents, buildings, idempotencyRecords, memberships, merchants, mockLocations, mockWaypoints, notifications, orders, products, recommendations, sessions, stops, trips, users } from './db/schema.js';
import { hashPassword } from './security.js';
import { nowIso } from './domain.js';

export const DEMO_PASSWORD = 'demo123';
export const SEED = {
  admin: 'user_admin', merchantUser: 'user_merchant', merchant: 'merchant_green_bowl', student: 'user_student', shipper: 'user_shipper',
  pendingMerchantUser: 'user_pending_merchant', pendingMerchant: 'merchant_river_kitchen',
  otherMerchantUser: 'user_other_merchant', otherMerchant: 'merchant_other',
};

export async function resetSeed(db: AppDb) {
  for (const table of [idempotencyRecords, notifications, auditEvents, mockLocations, recommendations, stops, trips, orders, memberships, applications, sessions, products, merchants, mockWaypoints, buildings, users]) await db.delete(table);
  const now = nowIso();
  const passwordHash = hashPassword(DEMO_PASSWORD);
  await db.insert(buildings).values([
    { id: 'building_c1', code: 'C1', name: 'Dormitory C1', pickupPointName: 'C1 internal-road pickup', pickupLatitude: 10.883067, pickupLongitude: 106.780804, mapXRatio: .45, mapYRatio: .40, createdAt: now, updatedAt: now },
    { id: 'building_c3', code: 'C3', name: 'Dormitory C3', pickupPointName: 'C3 internal-road pickup', pickupLatitude: 10.883756, pickupLongitude: 106.780340, mapXRatio: .35, mapYRatio: .50, createdAt: now, updatedAt: now },
    { id: 'building_d2', code: 'D2', name: 'Dormitory D2', pickupPointName: 'D2 internal-road pickup', pickupLatitude: 10.884338, pickupLongitude: 106.781741, mapXRatio: .65, mapYRatio: .55, createdAt: now, updatedAt: now },
    { id: 'building_e1', code: 'E1', name: 'Dormitory E1', pickupPointName: 'E1 internal-road pickup', pickupLatitude: 10.884631, pickupLongitude: 106.779626, mapXRatio: .20, mapYRatio: .60, createdAt: now, updatedAt: now },
    { id: 'building_e3', code: 'E3', name: 'Dormitory E3', pickupPointName: 'E3 internal-road pickup', pickupLatitude: 10.885621, pickupLongitude: 106.779813, mapXRatio: .25, mapYRatio: .80, createdAt: now, updatedAt: now },
  ]);
  await db.insert(users).values([
    { id: SEED.admin, name: 'Mai Pham', email: 'admin@demo.local', phone: '0900000000', passwordHash, rolesJson: '["ADMIN"]', buildingId: null, createdAt: now, updatedAt: now },
    { id: SEED.merchantUser, name: 'Linh Nguyen', email: 'merchant@demo.local', phone: '0900000001', passwordHash, rolesJson: '["MERCHANT"]', buildingId: null, createdAt: now, updatedAt: now },
    { id: SEED.pendingMerchantUser, name: 'Quynh Ho', email: 'pending-merchant@demo.local', phone: '0900000004', passwordHash, rolesJson: '["MERCHANT"]', buildingId: null, createdAt: now, updatedAt: now },
    { id: SEED.student, name: 'An Tran', email: 'student@demo.local', phone: '0900000002', passwordHash, rolesJson: '["STUDENT"]', buildingId: 'building_c3', createdAt: now, updatedAt: now },
    { id: SEED.shipper, name: 'Binh Le', email: 'shipper@demo.local', phone: '0900000003', passwordHash, rolesJson: '["STUDENT","SHIPPER"]', buildingId: 'building_d2', createdAt: now, updatedAt: now },
    { id: 'user_student_d2', name: 'Chi Pham', email: 'student2@demo.local', phone: null, passwordHash, rolesJson: '["STUDENT"]', buildingId: 'building_d2', createdAt: now, updatedAt: now },
    { id: 'user_student_f1', name: 'Dung Vo', email: 'student3@demo.local', phone: null, passwordHash, rolesJson: '["STUDENT"]', buildingId: 'building_e1', createdAt: now, updatedAt: now },
    { id: SEED.otherMerchantUser, name: 'Thao Bui', email: 'other-merchant@demo.local', phone: null, passwordHash, rolesJson: '["MERCHANT"]', buildingId: null, createdAt: now, updatedAt: now },
  ]);
  await db.insert(merchants).values([
    { id: SEED.merchant, ownerUserId: SEED.merchantUser, name: 'Green Bowl', description: 'Campus bowls and fresh drinks', status: 'APPROVED', reviewedByUserId: SEED.admin, reviewedAt: now, createdAt: now, updatedAt: now },
    { id: SEED.pendingMerchant, ownerUserId: SEED.pendingMerchantUser, name: 'River Kitchen', description: 'New merchant awaiting campus approval', status: 'PENDING', reviewedByUserId: null, reviewedAt: null, createdAt: now, updatedAt: now },
    { id: SEED.otherMerchant, ownerUserId: SEED.otherMerchantUser, name: 'Other Kitchen', description: 'Ownership isolation demo', status: 'APPROVED', reviewedByUserId: SEED.admin, reviewedAt: now, createdAt: now, updatedAt: now },
  ]);
  await db.insert(products).values([
    { id: 'product_rice', merchantId: SEED.merchant, name: 'Chicken Rice Bowl', price: 45000, category: 'RICE', freshnessRisk: 'MEDIUM', isAvailable: true, createdAt: now, updatedAt: now },
    { id: 'product_drink', merchantId: SEED.merchant, name: 'Iced Milk Tea', price: 25000, category: 'DRINK', freshnessRisk: 'HIGH', isAvailable: true, createdAt: now, updatedAt: now },
    { id: 'product_other', merchantId: SEED.otherMerchant, name: 'Private Meal', price: 50000, category: 'RICE', freshnessRisk: 'LOW', isAvailable: true, createdAt: now, updatedAt: now },
  ]);
  await db.insert(memberships).values({ id: 'membership_seed_shipper', studentId: SEED.shipper, merchantId: SEED.merchant, isActive: true, approvedAt: now, deactivatedAt: null, createdAt: now, updatedAt: now });
  await db.insert(applications).values({ id: 'application_pending', studentId: SEED.student, merchantId: SEED.merchant, vehicleType: 'BICYCLE', availability: 'Weekday evenings', experience: 'Campus volunteer', note: 'Knows all dorm gates', status: 'PENDING', reviewedByUserId: null, reviewedAt: null, createdAt: now, updatedAt: now });
  const old = new Date(Date.now() - 18 * 60_000).toISOString();
  await db.insert(orders).values([
    { id: 'order_c3_1', studentId: SEED.student, merchantId: SEED.merchant, buildingId: 'building_c3', productId: 'product_rice', status: 'READY', readyAt: old, deliveryAttempt: 1, tripId: null, stopId: null, createdAt: now, updatedAt: now },
    { id: 'order_c3_2', studentId: SEED.student, merchantId: SEED.merchant, buildingId: 'building_c3', productId: 'product_drink', status: 'READY', readyAt: old, deliveryAttempt: 1, tripId: null, stopId: null, createdAt: now, updatedAt: now },
    { id: 'order_d2_1', studentId: 'user_student_d2', merchantId: SEED.merchant, buildingId: 'building_d2', productId: 'product_drink', status: 'READY', readyAt: old, deliveryAttempt: 1, tripId: null, stopId: null, createdAt: now, updatedAt: now },
    { id: 'order_f1_1', studentId: 'user_student_f1', merchantId: SEED.merchant, buildingId: 'building_e1', productId: 'product_rice', status: 'PREPARING', readyAt: null, deliveryAttempt: 1, tripId: null, stopId: null, createdAt: now, updatedAt: now },
    { id: 'order_other', studentId: SEED.student, merchantId: SEED.otherMerchant, buildingId: 'building_c3', productId: 'product_other', status: 'READY', readyAt: old, deliveryAttempt: 1, tripId: null, stopId: null, createdAt: now, updatedAt: now },
  ]);
  await db.insert(mockWaypoints).values([
    { id: 'wp0', routeKey: 'campus-depot', waypointIndex: 0, latitude: 10.883162, longitude: 106.781156, mapXRatio: 0, mapYRatio: 0, offsetSeconds: 0 },
  ]);
}

export async function seedIfEmpty(db: AppDb) {
  const existing = await db.select().from(users).where(eq(users.id, SEED.merchantUser)).limit(1);
  if (!existing.length) { await resetSeed(db); return; }
  const now = nowIso();
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const admin = await db.select().from(users).where(eq(users.id, SEED.admin)).limit(1);
  if (!admin.length) await db.insert(users).values({ id: SEED.admin, name: 'Mai Pham', email: 'admin@demo.local', phone: '0900000000', passwordHash, rolesJson: '["ADMIN"]', buildingId: null, createdAt: now, updatedAt: now });
  const pendingOwner = await db.select().from(users).where(eq(users.id, SEED.pendingMerchantUser)).limit(1);
  if (!pendingOwner.length) await db.insert(users).values({ id: SEED.pendingMerchantUser, name: 'Quynh Ho', email: 'pending-merchant@demo.local', phone: '0900000004', passwordHash, rolesJson: '["MERCHANT"]', buildingId: null, createdAt: now, updatedAt: now });
  const pendingMerchant = await db.select().from(merchants).where(eq(merchants.id, SEED.pendingMerchant)).limit(1);
  if (!pendingMerchant.length) await db.insert(merchants).values({ id: SEED.pendingMerchant, ownerUserId: SEED.pendingMerchantUser, name: 'River Kitchen', description: 'New merchant awaiting campus approval', status: 'PENDING', reviewedByUserId: null, reviewedAt: null, createdAt: now, updatedAt: now });
}
