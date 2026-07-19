import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShipperDashboard } from './ShipperDashboard'
import { initialDemoState } from '../data/seed'

const stop = { id: 'STOP-building_c3', buildingId: 'building_c3', sequence: 1, status: 'ARRIVED' as const, orderIds: ['order_c3_1'], minimumWaitEndsAt: new Date(Date.now() + 110_000).toISOString() }
const state = { ...initialDemoState, orders: initialDemoState.orders.map((order) => order.id === 'order_c3_1' ? { ...order, status: 'NOTIFIED_TO_COME_DOWN' as const } : order), trip: { id: 'trip-live', recommendationId: 'route-live', merchantId: 'merchant_green_bowl', shipperName: 'Binh Le', status: 'IN_PROGRESS' as const, estimatedMinutes: 18, stops: [stop], currentStopId: stop.id, routeExplanation: [], gps: { x: 9, y: 78, updatedAt: new Date().toISOString() } } }
const action = vi.fn(async () => undefined)
vi.mock('../state/AppContext', () => ({ useApp: () => ({ data: state, actions: {}, arrivedAt: {}, announcedStops: [], countdownEndsAt: null, createTrip: action, confirmRoute: action, rejectRoute: action, cancelCountdown: action, announceStop: action, arriveStop: action, setOutcome: action, completeStop: action, markUnavailable: action, recalculate: action, gpsAction: action }) }))

describe('shipper wait lock', () => {
  it('keeps delivered enabled and unavailable disabled until the persisted server deadline', () => {
    vi.useFakeTimers()
    const view = render(<ShipperDashboard />)
    expect(screen.getByRole('button', { name: /Delivered/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Customer unavailable/i })).toBeDisabled()
    view.unmount()
    vi.useRealTimers()
  })
})
