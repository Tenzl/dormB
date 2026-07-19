import { ArrowCounterClockwise, BowlFood, ShieldCheck, SignOut, Storefront, Truck, UserCircle } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { navigate, rolePath } from '../lib/navigation'
import { useApp } from '../state/AppContext'
import type { Role } from '../types'
import { Button, ToastStack } from './Ui'

const roleMeta: Record<Role, { label: string; icon: typeof UserCircle }> = {
  ADMIN: { label: 'Admin', icon: ShieldCheck },
  STUDENT: { label: 'Student', icon: UserCircle },
  MERCHANT: { label: 'Merchant', icon: Storefront },
  SHIPPER: { label: 'Shipper', icon: Truck },
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session, demoFallback, notices, dismissNotice, signOut, switchRole, resetDemo, actions } = useApp()
  if (!session) return <>{children}<ToastStack notices={notices} dismiss={dismissNotice} /></>

  return <div className="min-h-[100dvh] bg-stone-50 text-zinc-900">
    <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-stone-50/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 md:px-7">
        <a href="/" aria-label="Courtyard home" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 text-white"><BowlFood size={18} weight="regular" /></span>
          <span className="hidden text-sm font-semibold tracking-tight sm:block">Courtyard</span>
        </a>
        <span className="h-5 w-px bg-zinc-300" />
        <nav className="flex flex-1 items-center gap-1" aria-label="Workspace navigation">
          {session.roles.map((role) => {
            const Icon = roleMeta[role].icon
            const active = session.activeRole === role
            return <button
              key={role}
              onClick={() => { void switchRole(role).then((switched) => switched && navigate(rolePath[role])) }}
              aria-label={`${roleMeta[role].label} workspace`}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition active:scale-[.98] ${active ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}
            >
              <Icon size={17} weight="regular" />
              <span className="hidden sm:inline">{roleMeta[role].label}</span>
            </button>
          })}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-right sm:block">
            <span className="block text-xs font-medium text-zinc-800">{session.name}</span>
            <span className="block font-mono text-[9px] uppercase tracking-[.12em] text-zinc-400">{roleMeta[session.activeRole].label} workspace</span>
          </span>
          <button onClick={() => { void signOut().then((signedOut) => signedOut && navigate('/login')) }} className="rounded-xl p-2.5 text-zinc-500 hover:bg-zinc-100" aria-label="Sign out"><SignOut size={19} /></button>
        </div>
      </div>
    </header>
    {demoFallback && <div className="border-b border-emerald-200 bg-emerald-50"><div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-2 text-xs text-emerald-900 md:px-7"><span>Seeded local mode · interactions stay deterministic</span><Button tone="quiet" className="min-h-8 px-2 py-1 text-xs" busy={actions.reset === 'loading'} onClick={() => void resetDemo()}><ArrowCounterClockwise size={14} />Reset demo</Button></div></div>}
    <main className="mx-auto max-w-[1400px] px-4 py-8 pb-24 md:px-7 md:py-12">{children}</main>
    <footer className="border-t border-zinc-200 px-4 py-6 text-xs text-zinc-500"><div className="mx-auto flex max-w-[1400px] items-center justify-between"><span>Campus batch delivery</span><span className="font-mono">API /api/v1</span></div></footer>
    <ToastStack notices={notices} dismiss={dismissNotice} />
  </div>
}
