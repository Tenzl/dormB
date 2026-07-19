import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage'

vi.mock('../state/AppContext', () => ({
  useApp: () => ({ session: null }),
}))

describe('product landing page', () => {
  it('introduces the product and its three operator workspaces', () => {
    render(<LandingPage />)

    expect(screen.getByRole('heading', { name: /one batch\. one route/i })).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Merchant')).toBeInTheDocument()
    expect(screen.getByText('Shipper')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /campus delivery route preview/i })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /sign in|access your account/i })[0]).toHaveAttribute('href', '/login')
  })
})
