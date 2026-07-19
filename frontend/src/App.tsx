import { useEffect, useRef, useState, type ComponentType } from 'react'
import { AppShell } from './components/AppShell'
import { navigate, pathRole, rolePath } from './lib/navigation'
import { AdminDashboard } from './screens/AdminDashboard'
import { LandingPage } from './screens/LandingPage'
import { MerchantDashboard } from './screens/MerchantDashboard'
import { ShipperDashboard } from './screens/ShipperDashboard'
import { SignIn } from './screens/SignIn'
import { StudentDashboard } from './screens/StudentDashboard'
import { useApp } from './state/AppContext'
import type { Role } from './types'

const dashboard: Record<Role, ComponentType> = {
  ADMIN: AdminDashboard,
  MERCHANT: MerchantDashboard,
  SHIPPER: ShipperDashboard,
  STUDENT: StudentDashboard,
}

export default function App() {
  const { session, switchRole, bootState } = useApp()
  const [pathname, setPathname] = useState(window.location.pathname)
  const [transitionRole, setTransitionRole] = useState<Role | null>(null)
  const switchingRole = useRef<Role | null>(null)

  useEffect(() => {
    const syncPath = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', syncPath)
    return () => window.removeEventListener('popstate', syncPath)
  }, [])

  useEffect(() => {
    if (pathname === '/') return

    if (!session) {
      if (bootState === 'loading') return
      if (pathname !== '/login') navigate('/login', true)
      return
    }

    const requestedRole = pathRole[pathname]
    if (requestedRole && session.roles.includes(requestedRole)) {
      if (session.activeRole !== requestedRole && switchingRole.current !== requestedRole) {
        switchingRole.current = requestedRole
        setTransitionRole(requestedRole)
        void switchRole(requestedRole).then((switched) => {
          switchingRole.current = null
          setTransitionRole(null)
          if (!switched) navigate(rolePath[session.activeRole], true)
        })
      }
      return
    }

    navigate(rolePath[session.activeRole], true)
  }, [bootState, pathname, session, switchRole])

  if (pathname === '/') return <LandingPage />
  if (!session) return <SignIn />
  if (transitionRole) return <AppShell><div className="grid min-h-[50dvh] place-items-center" role="status"><p className="font-mono text-xs uppercase tracking-[.16em] text-zinc-500">Loading {transitionRole.toLowerCase()} workspace…</p></div></AppShell>

  const requestedRole = pathRole[pathname]
  const activeRole = requestedRole && session.roles.includes(requestedRole)
    ? requestedRole
    : session.activeRole
  const Dashboard = dashboard[activeRole]

  return <AppShell><Dashboard /></AppShell>
}
