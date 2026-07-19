import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentDashboard } from './StudentDashboard'
import { initialDemoState } from '../data/seed'

const mock = vi.hoisted(() => ({ app: {} as any }))

vi.mock('../state/AppContext', () => ({ useApp: () => mock.app }))
vi.mock('../components/CampusMap', () => ({
  CampusMap: ({ audience }: { audience?: string }) => <div data-testid="campus-map" data-audience={audience} />,
}))

const stop = {
  id: 'STOP-building_c3',
  buildingId: 'building_c3',
  sequence: 1,
  status: 'NEXT' as const,
  orderIds: ['order_c3_1'],
}

function studentApp(routeVisible: boolean) {
  return {
    session: initialDemoState ? {
      userId: 'user_student',
      name: 'An Tran',
      email: 'student@demo.local',
      roles: ['STUDENT'],
      activeRole: 'STUDENT',
      buildingId: 'building_c3',
    } : null,
    actions: {},
    submitApplication: vi.fn(),
    studentReady: vi.fn(),
    data: {
      ...initialDemoState,
      orders: [
        { ...initialDemoState.orders[0], id: 'order-unrelated', productName: 'Later meal', status: 'READY' as const },
        ...initialDemoState.orders.map((order) => order.id === 'order_c3_1'
          ? { ...order, status: routeVisible ? 'NOTIFIED_TO_COME_DOWN' as const : 'ASSIGNED_TO_TRIP' as const }
          : order),
      ],
      trip: {
        id: 'trip-live',
        merchantId: 'merchant_green_bowl',
        shipperName: 'Binh Le',
        status: 'IN_PROGRESS' as const,
        estimatedMinutes: 18,
        remainingEstimatedMinutes: routeVisible ? 6 : undefined,
        stops: [routeVisible ? { ...stop, announcedAt: new Date().toISOString() } : stop],
        currentStopId: routeVisible ? stop.id : undefined,
        routeExplanation: [],
        routeVersion: 1,
        routeSections: [],
        studentTracking: {
          visible: routeVisible,
          locationVisible: true,
          routeVisible,
          state: routeVisible ? 'ON_THE_WAY' as const : 'WAITING_FOR_ANNOUNCEMENT' as const,
          buildingId: 'building_c3',
          stopId: stop.id,
        },
        gps: {
          longitude: 106.781156,
          latitude: 10.883162,
          heading: 0,
          progressRatio: 0,
          routeVersion: 1,
          updatedAt: new Date().toISOString(),
        },
      },
    },
  }
}

describe('student tracking stages', () => {
  afterEach(cleanup)

  beforeEach(() => {
    mock.app = studentApp(false)
  })

  it('shows a confirmed order, shipper map, and pickup building before the student route opens', () => {
    render(<StudentDashboard />)
    expect(screen.getByText('Your order is confirmed')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'order_c3_1' })).toBeInTheDocument()
    expect(screen.getByText('Shipper is serving earlier buildings')).toBeInTheDocument()
    expect(screen.getByText('Opens when it is your turn')).toBeInTheDocument()
    expect(screen.getByTestId('campus-map')).toHaveAttribute('data-audience', 'student')
  })

  it('shows the route ETA only after the shipper announces the student building', () => {
    mock.app = studentApp(true)
    render(<StudentDashboard />)
    expect(screen.getByText('Shipper is on the way to you')).toBeInTheDocument()
    expect(screen.getByText('About 6 min')).toBeInTheDocument()
    expect(screen.queryByText('Opens when it is your turn')).not.toBeInTheDocument()
  })
})
