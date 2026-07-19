import type { DemoState, Session } from '../types'

export const demoAccounts: Session[] = [
  { userId: 'user_admin', name: 'Mai Pham', email: 'admin@demo.local', roles: ['ADMIN'], activeRole: 'ADMIN' },
  { userId: 'user_student', name: 'An Tran', email: 'student@demo.local', roles: ['STUDENT'], activeRole: 'STUDENT', buildingId: 'building_c3' },
  { userId: 'user_merchant', name: 'Linh Nguyen', email: 'merchant@demo.local', roles: ['MERCHANT'], activeRole: 'MERCHANT', merchantId: 'merchant_green_bowl', merchantStatus: 'APPROVED' },
  { userId: 'user_pending_merchant', name: 'Quynh Ho', email: 'pending-merchant@demo.local', roles: ['MERCHANT'], activeRole: 'MERCHANT', merchantId: 'merchant_river_kitchen', merchantStatus: 'PENDING' },
  { userId: 'user_shipper', name: 'Binh Le', email: 'shipper@demo.local', roles: ['STUDENT', 'SHIPPER'], activeRole: 'SHIPPER', merchantId: 'merchant_green_bowl', buildingId: 'building_d2' },
]

export const initialDemoState: DemoState = {
  merchants: [
    { id: 'merchant_green_bowl', name: 'Green Bowl', description: 'Rice bowls and fresh campus lunches.', prepMinutes: 16, active: true, status: 'APPROVED', ownerName: 'Linh Nguyen', ownerEmail: 'merchant@demo.local' },
    { id: 'merchant_river_kitchen', name: 'River Kitchen', description: 'New merchant awaiting campus approval.', prepMinutes: 18, active: false, status: 'PENDING', ownerName: 'Quynh Ho', ownerEmail: 'pending-merchant@demo.local' },
    { id: 'merchant_other', name: 'Other Kitchen', description: 'Noodles, soups and late study meals.', prepMinutes: 22, active: true, status: 'APPROVED', ownerName: 'Thao Bui', ownerEmail: 'other-merchant@demo.local' },
  ],
  products: [
    { id: 'product_rice', merchantId: 'merchant_green_bowl', name: 'Lemongrass chicken bowl', category: 'Rice bowl', description: 'Charred chicken, pickles and herb rice.', available: true },
    { id: 'product_drink', merchantId: 'merchant_green_bowl', name: 'Tamarind tea', category: 'Drink', description: 'Fresh tamarind tea with citrus.', available: true },
    { id: 'product_other', merchantId: 'merchant_other', name: 'Roasted mushroom noodles', category: 'Noodles', description: 'Wheat noodles with roasted mushroom broth.', available: true },
  ],
  buildings: [
    { id: 'campus_b1', code: 'B1', name: 'Dormitory B1', pickupLabel: 'KTX Khu B residence', longitude: 106.7830215, latitude: 10.8827457 },
    { id: 'campus_b2', code: 'B2', name: 'Dormitory B2', pickupLabel: 'KTX Khu B residence', longitude: 106.7827447, latitude: 10.8830668 },
    { id: 'campus_b3', code: 'B3', name: 'Dormitory B3', pickupLabel: 'KTX Khu B residence', longitude: 106.7824065, latitude: 10.8836056 },
    { id: 'campus_b4', code: 'B4', name: 'Dormitory B4', pickupLabel: 'KTX Khu B residence', longitude: 106.783417, latitude: 10.883176 },
    { id: 'campus_b5', code: 'B5', name: 'Dormitory B5', pickupLabel: 'KTX Khu B residence', longitude: 106.7829325, latitude: 10.8840362 },
    { id: 'campus_ba1', code: 'BA1', name: 'Dormitory BA1', pickupLabel: 'KTX Khu B residence', longitude: 106.7818779, latitude: 10.8818715 },
    { id: 'campus_ba2', code: 'BA2', name: 'Dormitory BA2', pickupLabel: 'KTX Khu B residence', longitude: 106.7816362, latitude: 10.8821539 },
    { id: 'campus_ba3', code: 'BA3', name: 'Dormitory BA3', pickupLabel: 'KTX Khu B residence', longitude: 106.7811161, latitude: 10.8826262 },
    { id: 'campus_ba4', code: 'BA4', name: 'Dormitory BA4', pickupLabel: 'KTX Khu B residence', longitude: 106.7814141, latitude: 10.8816328 },
    { id: 'campus_ba5', code: 'BA5', name: 'Dormitory BA5', pickupLabel: 'KTX Khu B residence', longitude: 106.7807794, latitude: 10.8823421 },
    { id: 'building_c1', code: 'C1', name: 'C1 Residence', pickupLabel: 'Internal-road pickup', longitude: 106.780804, latitude: 10.883067, serviceable: true, x: 42, y: 63 },
    { id: 'campus_c2', code: 'C2', name: 'Dormitory C2', pickupLabel: 'KTX Khu B residence', longitude: 106.7804543, latitude: 10.883476 },
    { id: 'building_c3', code: 'C3', name: 'C3 Residence', pickupLabel: 'Internal-road pickup', longitude: 106.780340, latitude: 10.883756, serviceable: true, x: 34, y: 50 },
    { id: 'campus_c4', code: 'C4', name: 'Dormitory C4', pickupLabel: 'KTX Khu B residence', longitude: 106.7799737, latitude: 10.8841315 },
    { id: 'campus_c5', code: 'C5', name: 'Dormitory C5', pickupLabel: 'KTX Khu B residence', longitude: 106.7799437, latitude: 10.883115 },
    { id: 'campus_c6', code: 'C6', name: 'Dormitory C6', pickupLabel: 'KTX Khu B residence', longitude: 106.779533, latitude: 10.8836141 },
    { id: 'building_d2', code: 'D2', name: 'D2 Residence', pickupLabel: 'Internal-road pickup', longitude: 106.781741, latitude: 10.884338, serviceable: true, x: 64, y: 39 },
    { id: 'campus_d3', code: 'D3', name: 'Dormitory D3', pickupLabel: 'KTX Khu B residence', longitude: 106.7813416, latitude: 10.8847709 },
    { id: 'campus_d4', code: 'D4', name: 'Dormitory D4', pickupLabel: 'KTX Khu B residence', longitude: 106.7811001, latitude: 10.8850586 },
    { id: 'campus_d5', code: 'D5', name: 'Dormitory D5', pickupLabel: 'KTX Khu B residence', longitude: 106.7821389, latitude: 10.8849035 },
    { id: 'campus_d6', code: 'D6', name: 'Dormitory D6', pickupLabel: 'KTX Khu B residence', longitude: 106.7817124, latitude: 10.8854183 },
    { id: 'building_e1', code: 'E1', name: 'E1 Residence', pickupLabel: 'Internal-road pickup', longitude: 106.779626, latitude: 10.884631, serviceable: true, x: 22, y: 34 },
    { id: 'campus_e2', code: 'E2', name: 'Dormitory E2', pickupLabel: 'KTX Khu B residence', longitude: 106.7794594, latitude: 10.8854883 },
    { id: 'building_e3', code: 'E3', name: 'E3 Residence', pickupLabel: 'Internal-road pickup', longitude: 106.779813, latitude: 10.885621, serviceable: true, x: 26, y: 17 },
    { id: 'campus_e4', code: 'E4', name: 'Dormitory E4', pickupLabel: 'KTX Khu B residence', longitude: 106.7807709, latitude: 10.8856438 },
  ],
  orders: [
    { id: 'order_c3_1', studentName: 'An Tran', studentId: 'user_student', merchantId: 'merchant_green_bowl', buildingId: 'building_c3', productName: 'Lemongrass chicken bowl', status: 'READY', readyAt: new Date(Date.now() - 18 * 60000).toISOString(), attempt: 1 },
    { id: 'order_d2_1', studentName: 'Chi Pham', studentId: 'user_student_d2', merchantId: 'merchant_green_bowl', buildingId: 'building_d2', productName: 'Tamarind tea', status: 'READY', readyAt: new Date(Date.now() - 11 * 60000).toISOString(), attempt: 1 },
    { id: 'order_f1_1', studentName: 'Dung Vo', studentId: 'user_student_f1', merchantId: 'merchant_green_bowl', buildingId: 'building_e1', productName: 'Lemongrass chicken bowl', status: 'PREPARING', attempt: 1 },
  ],
  applications: [
    { id: 'application_pending', studentName: 'An Tran', merchantId: 'merchant_green_bowl', vehicleType: 'Bicycle', availability: 'Weekdays, 17:30–21:00', experience: 'Six months of campus courier work', note: 'Comfortable with all residence pickup points.', status: 'PENDING' },
  ],
  trip: null,
}
