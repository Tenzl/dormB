import { Check, ReadCvLogo, Storefront, UserMinus, UsersThree, X } from '@phosphor-icons/react'
import { RouteOverview } from '../components/RouteOverview'
import { Button, EmptyState, SectionHeading, StatusBadge } from '../components/Ui'
import { useApp } from '../state/AppContext'
import type { OrderStatus } from '../types'

const nextLabel: Partial<Record<OrderStatus, string>> = { CREATED: 'Confirm order', CONFIRMED: 'Start preparing', PREPARING: 'Mark ready' }

export function MerchantDashboard() {
  const { session, data, actions, advanceOrder, decideApplication, deactivateShipper } = useApp()
  const merchantId = session?.merchantId ?? data.merchants[0]?.id
  const merchantOrders = data.orders.filter((order) => order.merchantId === merchantId)
  const pending = data.applications.filter((item) => item.merchantId === merchantId && item.status === 'PENDING')
  const approved = data.applications.filter((item) => item.merchantId === merchantId && item.status === 'APPROVED' && item.membershipId)

  if (session?.merchantStatus && session.merchantStatus !== 'APPROVED') return <div className="mx-auto max-w-3xl py-12"><div className="border-y border-zinc-300 py-10"><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-emerald-800"><Storefront size={14} />Merchant account</div><div className="mt-4 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-[-.04em] md:text-5xl">Approval required.</h1><StatusBadge status={session.merchantStatus} /></div><p className="mt-5 max-w-xl text-sm leading-relaxed text-zinc-600">Your account is separate and ready. Order, shipper and route operations unlock after an admin approves the merchant.</p></div></div>

  return <div className="space-y-12">
    <header className="flex flex-wrap items-end justify-between gap-5"><div><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-emerald-800"><Storefront size={14} />Merchant workspace</div><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] md:text-5xl">Orders and delivery.</h1><p className="mt-3 text-sm text-zinc-500">Prepare the batch, manage shippers and follow the live route.</p></div><div className="grid grid-cols-2 gap-8 border-l border-zinc-300 pl-5"><Metric value={merchantOrders.filter((order) => order.status === 'READY').length} label="ready" /><Metric value={pending.length} label="applications" /></div></header>

    <section><SectionHeading eyebrow="Live route" title={data.trip ? data.trip.id : 'No active trip'} /><RouteOverview trip={data.trip} buildings={data.buildings} /></section>

    <section><SectionHeading eyebrow="Kitchen" title="Order preparation" aside={<span className="font-mono text-xs text-zinc-500">{merchantOrders.length} orders</span>} />
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="border-b border-zinc-300 font-mono text-[10px] uppercase tracking-[.13em] text-zinc-500"><th className="pb-3 font-medium">Order</th><th className="pb-3 font-medium">Student</th><th className="pb-3 font-medium">Building</th><th className="pb-3 font-medium">Status</th><th className="pb-3 text-right font-medium">Action</th></tr></thead><tbody className="divide-y divide-zinc-200">{merchantOrders.map((order) => { const action = nextLabel[order.status]; return <tr key={order.id}><td className="py-4 pr-4"><p className="font-mono text-xs font-semibold">{order.id}</p><p className="mt-1 text-xs text-zinc-500">{order.productName}</p></td><td className="py-4 pr-4 text-sm">{order.studentName}</td><td className="py-4 pr-4 font-mono text-xs">{order.buildingId}</td><td className="py-4 pr-4"><StatusBadge status={order.status} /></td><td className="py-4 text-right">{action && !order.status.includes('TRIP') ? <Button tone="secondary" busy={actions[`order-${order.id}`] === 'loading'} onClick={() => void advanceOrder(order.id)}>{action}</Button> : <span className="text-xs text-zinc-400">Read only</span>}</td></tr> })}</tbody></table></div>
    </section>

    <section className="grid gap-10 lg:grid-cols-2"><div><SectionHeading eyebrow="Recruitment" title="Shipper applications" />{pending.length ? <div className="divide-y divide-zinc-200 border-y border-zinc-200">{pending.map((application) => <article key={application.id} className="py-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{application.studentName}</h3><p className="mt-1 text-xs text-zinc-500">{application.vehicleType} · {application.availability}</p></div><StatusBadge status={application.status} /></div><p className="mt-3 text-sm text-zinc-600">{application.experience}. {application.note}</p><div className="mt-4 flex gap-2"><Button busy={actions[`app-${application.id}-APPROVED`] === 'loading'} onClick={() => void decideApplication(application.id, 'APPROVED')}><Check size={16} />Approve</Button><Button tone="secondary" busy={actions[`app-${application.id}-REJECTED`] === 'loading'} onClick={() => void decideApplication(application.id, 'REJECTED')}><X size={16} />Reject</Button></div></article>)}</div> : <EmptyState icon={ReadCvLogo} title="Inbox is clear" description="New shipper applications will appear here." />}</div>
      <div><SectionHeading eyebrow="Team" title="Approved shippers" />{approved.length ? <div className="divide-y divide-zinc-200 border-y border-zinc-200">{approved.map((application) => <div key={application.id} className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-semibold">{application.studentName}</p><p className="mt-1 text-xs text-zinc-500">Active membership</p></div><Button tone="quiet" busy={actions[`deactivate-${application.membershipId}`] === 'loading'} onClick={() => application.membershipId && void deactivateShipper(application.membershipId)} aria-label={`Deactivate ${application.studentName}`}><UserMinus size={17} /></Button></div>)}</div> : <EmptyState icon={UsersThree} title="No approved shipper" description="Approve an application to add a shipper." />}</div>
    </section>
  </div>
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div><p className="font-mono text-2xl font-semibold">{value}</p><p className="text-xs text-zinc-500">{label}</p></div>
}
