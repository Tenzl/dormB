import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Session } from './types'

const mockedApp = vi.hoisted(() => ({
  session: null as Session | null,
  switchRole: vi.fn(),
}))

vi.mock('./state/AppContext', () => ({
  useApp: () => ({ ...mockedApp, bootState: 'idle' }),
}))
vi.mock('./components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('./screens/AdminDashboard', () => ({ AdminDashboard: () => <h1>Admin portal</h1> }))
vi.mock('./screens/MerchantDashboard', () => ({ MerchantDashboard: () => <h1>Merchant portal</h1> }))
vi.mock('./screens/ShipperDashboard', () => ({ ShipperDashboard: () => <h1>Shipper portal</h1> }))
vi.mock('./screens/StudentDashboard', () => ({ StudentDashboard: () => <h1>Student tracker</h1> }))
vi.mock('./screens/SignIn', () => ({ SignIn: () => <h1>Account sign in</h1> }))
vi.mock('./screens/LandingPage', () => ({ LandingPage: () => <h1>Product landing</h1> }))

describe('role workspace routing', () => {
  afterEach(cleanup)

  beforeEach(() => {
    mockedApp.session = null
    mockedApp.switchRole.mockReset()
    mockedApp.switchRole.mockResolvedValue(true)
    window.history.replaceState({}, '', '/')
  })

  it('keeps the landing page public', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Product landing' })).toBeInTheDocument()
  })

  it('redirects a signed-out protected route to login', async () => {
    window.history.replaceState({}, '', '/admin')
    render(<App />)

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(screen.getByRole('heading', { name: 'Account sign in' })).toBeInTheDocument()
  })

  it('renders the merchant portal on its dedicated route', () => {
    mockedApp.session = {
      userId: 'merchant-1',
      name: 'Merchant',
      roles: ['MERCHANT'],
      activeRole: 'MERCHANT',
    }
    window.history.replaceState({}, '', '/merchant')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Merchant portal' })).toBeInTheDocument()
  })

  it('returns an authenticated user to an authorized workspace', async () => {
    mockedApp.session = {
      userId: 'merchant-1',
      name: 'Merchant',
      roles: ['MERCHANT'],
      activeRole: 'MERCHANT',
    }
    window.history.replaceState({}, '', '/admin')
    render(<App />)

    await waitFor(() => expect(window.location.pathname).toBe('/merchant'))
    expect(screen.getByRole('heading', { name: 'Merchant portal' })).toBeInTheDocument()
  })
})
