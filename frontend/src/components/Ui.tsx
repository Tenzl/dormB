import { CheckCircle, Info, Warning, X, type Icon } from '@phosphor-icons/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { AsyncState, OrderStatus, TripStatus } from '../types'

export function Button({ children, tone = 'primary', busy = false, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; tone?: 'primary' | 'secondary' | 'danger' | 'quiet'; busy?: boolean }) {
  const tones = { primary: 'bg-zinc-900 text-white hover:bg-zinc-800', secondary: 'border border-zinc-300 bg-white text-zinc-900 hover:border-zinc-500', danger: 'border border-red-200 bg-red-50 text-red-800 hover:bg-red-100', quiet: 'text-zinc-600 hover:bg-zinc-100' }
  return <button className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-300 ease-[cubic-bezier(.16,1,.3,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 ${tones[tone]} ${className}`} disabled={busy || props.disabled} {...props}>{busy && <span className="h-3.5 w-3.5 animate-pulse rounded-sm bg-current opacity-50" aria-hidden="true" />}{children}</button>
}

const labels: Record<string, string> = {
  CREATED: 'Created', CONFIRMED: 'Confirmed', PREPARING: 'Preparing', READY: 'Ready', ASSIGNED_TO_TRIP: 'Assigned', NOTIFIED_TO_COME_DOWN: 'Come downstairs', TEMP_WAITING: 'Waiting for you', TEMP_WAITING_READY: 'Ready for retry', REDELIVERY_NEXT: 'Redelivery next', DELIVERED: 'Delivered', FAILED_DELIVERY: 'Failed',
  DRAFT_GENERATING: 'Generating', AWAITING_SHIPPER_CONFIRMATION: 'Needs confirmation', STARTING: 'Starting', IN_PROGRESS: 'In progress', REDELIVERY: 'Redelivery', COMPLETED: 'Completed', GENERATION_FAILED: 'Generation failed', CANCELLED_BEFORE_START: 'Cancelled',
  PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled', WAITING: 'Waiting', NEXT: 'Next', ARRIVED: 'Arrived', RETRY_WAITING: 'Retry waiting', RETRY_NEXT: 'Retry next', RETRY_ARRIVED: 'Retry arrived', RETRY_COMPLETED: 'Retry complete',
}

export function StatusBadge({ status }: { status: OrderStatus | TripStatus | string }) {
  const success = ['READY', 'DELIVERED', 'COMPLETED', 'APPROVED'].includes(status)
  const danger = ['FAILED_DELIVERY', 'GENERATION_FAILED', 'REJECTED'].includes(status)
  const active = ['IN_PROGRESS', 'ARRIVED', 'NEXT', 'REDELIVERY', 'STARTING'].includes(status)
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium ${success ? 'bg-emerald-100 text-emerald-800' : danger ? 'bg-red-100 text-red-800' : active ? 'bg-amber-100 text-amber-900' : 'bg-zinc-100 text-zinc-600'}`}><span className={`h-1.5 w-1.5 rounded-full ${success ? 'bg-emerald-600' : danger ? 'bg-red-600' : active ? 'animate-pulse bg-amber-600' : 'bg-zinc-400'}`} />{labels[status] ?? status.replaceAll('_', ' ').toLowerCase()}</span>
}

export function SectionHeading({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: ReactNode }) {
  return <div className="mb-5 flex items-end justify-between gap-4 border-b border-zinc-200 pb-4"><div><p className="mb-1 font-mono text-[10px] uppercase tracking-[.18em] text-emerald-800">{eyebrow}</p><h2 className="text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl">{title}</h2></div>{aside}</div>
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" role="status" aria-label="Loading content">{Array.from({ length: rows }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl bg-zinc-200/70" />)}</div>
}

export function EmptyState({ icon: EmptyIcon, title, description, action }: { icon: Icon; title: string; description: string; action?: ReactNode }) {
  return <div className="border-y border-dashed border-zinc-300 py-14 text-left"><EmptyIcon size={28} weight="regular" className="mb-5 text-emerald-700" aria-hidden="true" /><h3 className="font-semibold text-zinc-900">{title}</h3><p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">{description}</p>{action && <div className="mt-5">{action}</div>}</div>
}

export function InlineError({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert"><Warning size={18} weight="regular" className="mt-0.5 shrink-0" />{children}</div>
}

export function ToastStack({ notices, dismiss }: { notices: Array<{ id: number; tone: 'success' | 'error' | 'info'; message: string }>; dismiss: (id: number) => void }) {
  return <div className="fixed bottom-20 right-4 z-30 grid w-[min(24rem,calc(100vw-2rem))] gap-2 md:bottom-5" aria-live="polite">{notices.map((notice) => { const NoticeIcon = notice.tone === 'success' ? CheckCircle : notice.tone === 'error' ? Warning : Info; return <div key={notice.id} className="animate-rise flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-4 text-sm shadow-[0_18px_40px_-25px_rgba(24,24,27,.35)] backdrop-blur"><NoticeIcon size={19} weight="regular" className={notice.tone === 'error' ? 'text-red-700' : 'text-emerald-700'} /><p className="flex-1 leading-relaxed text-zinc-700">{notice.message}</p><button onClick={() => dismiss(notice.id)} aria-label="Dismiss message" className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X size={14} /></button></div> })}</div>
}

export function ActionFeedback({ state }: { state?: AsyncState }) {
  if (state !== 'error') return null
  return <p className="mt-2 text-xs text-red-700" role="alert">The action was not completed. Check the connection and try again.</p>
}
