import { BellRinging, Check, ClipboardText, Clock, MapPin, Package, PaperPlaneTilt, Plus, ShoppingBagOpen, Storefront, Truck } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { CampusMap } from '../components/CampusMap'
import { ActionFeedback, Button, EmptyState, SectionHeading, StatusBadge } from '../components/Ui'
import { useApp } from '../state/AppContext'

const PREP_STEPS = ['Confirmed', 'Preparing', 'Ready', 'On route'] as const
const STATUS_RANK = ['CREATED', 'CONFIRMED', 'PREPARING', 'READY', 'ASSIGNED_TO_TRIP', 'NOTIFIED_TO_COME_DOWN'] as const

export function StudentDashboard() {
  const { session, data, actions, placeOrder, submitApplication, studentReady } = useApp()
  const [showApplication, setShowApplication] = useState(false)
  const studentOrders = data.orders.filter((order) => order.studentId === session?.userId)
  const tripOrderIds = new Set(data.trip?.stops.flatMap((stop) => stop.orderIds) ?? [])
  const activeOrder = studentOrders.find((order) => tripOrderIds.has(order.id))
    ?? studentOrders.find((order) => order.status !== 'DELIVERED' && order.status !== 'FAILED_DELIVERY')
  const activeStudentOrders = studentOrders.filter((order) => order.status !== 'DELIVERED' && order.status !== 'FAILED_DELIVERY')
  const application = data.applications.find((item) => item.studentName === session?.name)
  const building = data.buildings.find((item) => item.id === session?.buildingId)
  const tripIncludesOrder = data.trip?.stops.some((stop) => activeOrder && stop.orderIds.includes(activeOrder.id))
  const remainingRouteMinutes = data.trip
    ? Math.ceil(data.trip.remainingEstimatedMinutes ?? data.trip.estimatedMinutes)
    : null
  const routeVisible = Boolean(data.trip && (data.trip.studentTracking?.routeVisible ?? data.trip.studentTracking?.visible ?? data.trip.stops.some((stop) => Boolean(stop.announcedAt))))
  const trackingState = data.trip?.studentTracking?.state
  const activeMerchant = data.merchants.find((merchant) => merchant.id === activeOrder?.merchantId)

  const noticeTitle = routeVisible
    ? (trackingState === 'ARRIVED' ? 'Shipper has arrived' : `Shipper is heading to ${building?.code ?? 'your building'}`)
    : tripIncludesOrder
      ? 'Your order is confirmed'
      : activeOrder?.status === 'READY'
        ? 'Your meal is ready'
        : 'The kitchen has your order'

  const noticeBody = routeVisible
    ? 'Follow the route and meet the shipper at your fixed building pickup point.'
    : tripIncludesOrder
      ? 'The map shows the shipper and your pickup building. Your route appears when it is your turn.'
      : 'A shipper-triggered trip will collect every eligible ready order.'

  const trackingHeadline = routeVisible
    ? (trackingState === 'ARRIVED' ? 'Meet the shipper now' : 'Shipper is on the way to you')
    : 'Shipper is serving earlier buildings'

  const etaPrimary = routeVisible && remainingRouteMinutes != null
    ? `~${remainingRouteMinutes}`
    : tripIncludesOrder
      ? 'Confirmed'
      : '16–22'

  const etaSecondary = routeVisible
    ? 'minutes to your building'
    : tripIncludesOrder
      ? 'waiting for your turn'
      : 'minute arrival window'

  const routeEtaLabel = routeVisible && remainingRouteMinutes != null
    ? `About ${remainingRouteMinutes} min`
    : 'Opens when it is your turn'

  return (
    <div className="space-y-12 md:space-y-16">
      {/* Compact identity strip */}
      <header className="grid gap-5 border-b border-zinc-200 pb-6 md:grid-cols-[minmax(0,1.4fr)_minmax(16rem,.6fr)] md:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-emerald-800">
            Student · {building?.id ?? 'Campus'}
          </p>
          <h1 className="mt-2 max-w-2xl text-2xl font-semibold tracking-[-.03em] text-zinc-900 md:text-4xl">
            Receive your order
          </h1>
          <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-zinc-500">
            Track the shipper on the map, then meet at your building pickup.
          </p>
        </div>
        <div className="md:border-l md:border-zinc-300 md:pl-5">
          <p className="text-xs text-zinc-500">Pickup point</p>
          <p className="mt-1 flex items-start gap-2 text-sm font-semibold text-zinc-900">
            <MapPin size={16} className="mt-0.5 shrink-0 text-emerald-700" weight="fill" />
            {building?.pickupLabel}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{building?.name}</p>
        </div>
      </header>

      {/* Map-first receive workspace */}
      <section aria-label="Live delivery tracking" className="animate-rise">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-emerald-800">Campus tracking</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-900 md:text-xl">
              {routeVisible ? 'Shipper is heading to your building' : 'Shipper location and your pickup building'}
            </h2>
          </div>
          {data.trip && <StatusBadge status={data.trip.status} />}
        </div>

        <CampusMap
          audience="student"
          buildings={data.buildings}
          trip={data.trip}
          studentBuildingId={session?.buildingId}
          wide
        />

        {/* Order + ETA strip under map */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,.85fr)]">
          <div className="rounded-[1.75rem] border border-zinc-200/80 bg-white p-5 shadow-[0_20px_40px_-28px_rgba(24,24,27,.12)] md:p-7">
            {activeOrder ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-100 pb-5">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[.16em] text-zinc-400">Live order</p>
                    <h2 className="mt-1.5 truncate text-xl font-semibold tracking-tight text-zinc-900">
                      {activeOrder.id}
                    </h2>
                    <p className="mt-2 text-base font-medium text-zinc-800">{activeOrder.productName}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {activeMerchant?.name ?? 'Campus kitchen'} · Pickup at {building?.name}
                    </p>
                  </div>
                  <StatusBadge status={activeOrder.status} />
                </div>

                <div className="mt-5 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
                  <ol className="grid grid-cols-4 gap-1.5" aria-label="Preparation progress">
                    {PREP_STEPS.map((label, index) => {
                      const orderIndex = STATUS_RANK.indexOf(activeOrder.status as typeof STATUS_RANK[number])
                      const reached = orderIndex >= index + 1
                      return (
                        <li key={label}>
                          <span className={`mb-2 block h-1 rounded-full transition-colors duration-300 ${reached ? 'bg-emerald-700' : 'bg-zinc-200'}`} />
                          <span className={`text-[10px] ${reached ? 'text-zinc-900' : 'text-zinc-400'}`}>{label}</span>
                        </li>
                      )
                    })}
                  </ol>

                  <div className="min-w-[8.5rem] border-t border-zinc-100 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Clock size={14} />
                      <span className="font-mono text-[10px] uppercase tracking-[.14em]">ETA</span>
                    </div>
                    <p className="mt-1 font-mono text-3xl font-semibold tracking-tight text-zinc-900">{etaPrimary}</p>
                    <p className="mt-1 text-xs text-zinc-500">{etaSecondary}</p>
                  </div>
                </div>

                <div className="mt-6 flex items-start justify-between gap-4 border-t border-zinc-100 pt-5">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[.15em] text-emerald-800">
                      {routeVisible ? 'Your turn' : 'Order confirmed'}
                    </p>
                    <h3 className="mt-1.5 text-base font-semibold text-zinc-900">{trackingHeadline}</h3>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-zinc-500">Your pickup</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900">{building?.name ?? session?.buildingId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Route to you</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900">{routeEtaLabel}</p>
                      </div>
                    </div>
                  </div>
                  <Truck size={22} className="mt-1 shrink-0 text-emerald-700" />
                </div>

                {activeOrder.status === 'TEMP_WAITING' && (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                    <div className="flex items-start gap-3">
                      <BellRinging size={22} className="mt-0.5 text-amber-800" />
                      <div className="flex-1">
                        <p className="font-semibold text-amber-950">The first pickup was missed.</p>
                        <p className="mt-1 text-sm leading-relaxed text-amber-900/75">
                          Tell the shipper when you can meet outside. This adds one redelivery attempt after the primary route.
                        </p>
                        <Button
                          className="mt-4"
                          busy={actions[`student-ready-${activeOrder.id}`] === 'loading'}
                          onClick={() => void studentReady(activeOrder.id)}
                        >
                          I am ready <Check size={17} />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon={Package}
                title="Nothing is waiting"
                description="Choose a merchant below to begin a seeded order. Completed orders remain in your history."
              />
            )}
          </div>

          <aside className="relative overflow-hidden rounded-[1.75rem] bg-zinc-900 p-6 text-white md:p-8">
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/10" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-10 left-8 h-24 w-24 rounded-full bg-emerald-400/5" aria-hidden="true" />
            <div className="relative">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${routeVisible ? 'animate-pulse bg-emerald-400' : 'bg-zinc-500'}`} />
                <Clock size={20} className="text-emerald-400" />
              </div>
              <p className="mt-8 font-mono text-[10px] uppercase tracking-[.16em] text-zinc-400">Latest notice</p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">{noticeTitle}</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{noticeBody}</p>
              {!data.trip && (
                <p className="mt-6 border-t border-white/10 pt-5 text-xs text-zinc-500">
                  No active trip yet. Your building and shipper position appear after a shipper confirms the trip.
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>

      {/* Active orders */}
      <section>
        <SectionHeading
          eyebrow="All your orders"
          title={`${activeStudentOrders.length} active order${activeStudentOrders.length === 1 ? '' : 's'}`}
        />
        {activeStudentOrders.length ? (
          <div className="divide-y divide-zinc-200 border-y border-zinc-200">
            {activeStudentOrders.map((order) => {
              const merchant = data.merchants.find((item) => item.id === order.merchantId)
              return (
                <article key={order.id} className="grid gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100 text-emerald-700">
                      <ShoppingBagOpen size={18} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{order.productName}</p>
                      <p className="mt-1 text-xs text-zinc-500">{merchant?.name ?? order.merchantId} · {order.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={order.status} />
                    {order.status === 'TEMP_WAITING' && (
                      <Button busy={actions[`student-ready-${order.id}`] === 'loading'} onClick={() => void studentReady(order.id)}>
                        I am ready
                      </Button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={ShoppingBagOpen}
            title="No active orders"
            description="Orders you place from campus kitchens will show up here until they are delivered."
          />
        )}
      </section>

      {/* Merchants */}
      <section>
        <SectionHeading eyebrow="Campus kitchens" title="Order from one or several merchants" />
        <div className="grid gap-0 divide-y divide-zinc-200 border-y border-zinc-200 lg:grid-cols-2 lg:gap-8 lg:divide-x lg:divide-y-0">
          {data.merchants.map((merchant, index) => {
            const merchantProducts = data.products.filter((product) => product.merchantId === merchant.id && product.available)
            return (
              <article key={merchant.id} className={`py-6 ${index % 2 === 0 ? 'lg:pr-8' : 'lg:pl-8'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Storefront size={18} className="text-emerald-700" />
                      <h3 className="font-semibold">{merchant.name}</h3>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-500">{merchant.description}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[.12em] text-zinc-500">
                    ~{merchant.prepMinutes} min
                  </span>
                </div>
                <div className="mt-5 divide-y divide-zinc-100 border-t border-zinc-100">
                  {merchantProducts.map((product) => (
                    <div key={product.id} className="grid grid-cols-[1fr_auto] items-center gap-4 py-4">
                      <div>
                        <p className="text-sm font-medium">{product.name}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {product.description}
                          {product.price != null ? ` · ${new Intl.NumberFormat('vi-VN').format(product.price)}₫` : ''}
                        </p>
                      </div>
                      <Button
                        tone="secondary"
                        busy={actions[`place-order-${product.id}`] === 'loading'}
                        onClick={() => void placeOrder(product.id)}
                      >
                        <Plus size={15} />Order
                      </Button>
                    </div>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
        <p className="mt-4 text-xs leading-5 text-zinc-500">
          Each press creates a separate order. You can order several items from the same kitchen or continue ordering from another kitchen.
        </p>
      </section>

      {/* Shipper application */}
      <section>
        <SectionHeading
          eyebrow="Work with a kitchen"
          title="Shipper application"
          aside={application && <StatusBadge status={application.status} />}
        />
        {application ? (
          <div className="grid gap-5 border-y border-zinc-200 py-6 md:grid-cols-[1fr_auto]">
            <div>
              <p className="font-semibold">Application to Saffron Canteen</p>
              <p className="mt-2 text-sm text-zinc-500">
                The merchant makes the final decision. You can hold only one active membership.
              </p>
            </div>
            <div className="font-mono text-xs text-zinc-500">{application.id}</div>
          </div>
        ) : showApplication ? (
          <ApplicationForm
            busy={actions.apply === 'loading'}
            onSubmit={submitApplication}
            onCancel={() => setShowApplication(false)}
            error={actions.apply === 'error'}
          />
        ) : (
          <EmptyState
            icon={ClipboardText}
            title="No active application"
            description="Apply to one merchant with your transport, availability and campus delivery experience."
            action={
              <Button onClick={() => setShowApplication(true)}>
                Apply as shipper <PaperPlaneTilt size={17} />
              </Button>
            }
          />
        )}
      </section>
    </div>
  )
}

function ApplicationForm({
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  busy: boolean
  error: boolean
  onSubmit: (form: { merchantId: string; vehicleType: string; availability: string; experience: string; note: string }) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    merchantId: 'merchant_green_bowl',
    vehicleType: '',
    availability: '',
    experience: '',
    note: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!form.vehicleType) next.vehicleType = 'Choose a vehicle type.'
    if (form.availability.trim().length < 5) next.availability = 'Add a useful availability window.'
    if (form.experience.trim().length < 8) next.experience = 'Describe your delivery or campus experience.'
    setErrors(next)
    if (!Object.keys(next).length) void onSubmit(form)
  }

  const field = (name: keyof typeof form, value: string) => setForm((current) => ({ ...current, [name]: value }))

  return (
    <form onSubmit={submit} className="grid gap-5 rounded-[2rem] border border-zinc-200 bg-white p-6 md:grid-cols-2 md:p-8" noValidate>
      <label className="grid gap-2 text-sm font-medium">
        Merchant
        <select value={form.merchantId} onChange={(e) => field('merchantId', e.target.value)} className="input">
          <option value="merchant_green_bowl">Green Bowl</option>
          <option value="merchant_other">Other Kitchen</option>
        </select>
        <span className="text-xs font-normal text-zinc-500">One active merchant membership at a time.</span>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Vehicle type
        <select value={form.vehicleType} onChange={(e) => field('vehicleType', e.target.value)} className="input">
          <option value="">Select transport</option>
          <option>Bicycle</option>
          <option>Electric bicycle</option>
          <option>Walking</option>
        </select>
        {errors.vehicleType && <span className="text-xs font-normal text-red-700">{errors.vehicleType}</span>}
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Availability
        <input className="input" value={form.availability} onChange={(e) => field('availability', e.target.value)} placeholder="Weekdays, 17:30–21:00" />
        {errors.availability && <span className="text-xs font-normal text-red-700">{errors.availability}</span>}
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Experience
        <input className="input" value={form.experience} onChange={(e) => field('experience', e.target.value)} placeholder="Campus or courier experience" />
        {errors.experience && <span className="text-xs font-normal text-red-700">{errors.experience}</span>}
      </label>
      <label className="grid gap-2 text-sm font-medium md:col-span-2">
        Note <span className="font-normal text-zinc-400">optional</span>
        <textarea className="input min-h-28 resize-y" value={form.note} onChange={(e) => field('note', e.target.value)} placeholder="Anything the merchant should know" />
      </label>
      <div className="flex gap-2 md:col-span-2">
        <Button busy={busy} type="submit">Send application</Button>
        <Button tone="quiet" type="button" onClick={onCancel}>Cancel</Button>
      </div>
      {error && (
        <div className="md:col-span-2">
          <ActionFeedback state="error" />
        </div>
      )}
    </form>
  )
}
