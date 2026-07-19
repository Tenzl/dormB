import { ArrowRight, BowlFood, Buildings, CheckCircle, MapPin, ShieldCheck, Storefront, Truck } from '@phosphor-icons/react'
import { useApp } from '../state/AppContext'
import { rolePath } from '../lib/navigation'

const roles = [
  { icon: ShieldCheck, label: 'Admin', title: 'Approve and oversee', text: 'Review merchant access and monitor every active delivery from one calm operations view.', number: '01' },
  { icon: Storefront, label: 'Merchant', title: 'Prepare and coordinate', text: 'Move orders through preparation, manage approved shippers and follow the live route.', number: '02' },
  { icon: Truck, label: 'Shipper', title: 'Confirm and deliver', text: 'Review the recommended batch, confirm the route and complete each dormitory stop.', number: '03' },
]

function RoutePreview() {
  return <div className="relative aspect-[16/11] overflow-hidden rounded-[2rem] border border-zinc-300 bg-[#ebece4] shadow-[0_30px_80px_-50px_rgba(24,24,27,.5)]">
    <div className="map-grid absolute inset-0 opacity-55" />
    <svg aria-label="Campus delivery route preview" role="img" viewBox="0 0 640 440" className="absolute inset-0 h-full w-full">
      <path d="M72 354 C160 310 150 125 276 116 S400 345 548 102" fill="none" stroke="#047857" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 11" />
      <circle cx="72" cy="354" r="9" fill="#18181b" /><circle cx="276" cy="116" r="9" fill="#fff" stroke="#18181b" strokeWidth="4" /><circle cx="420" cy="302" r="9" fill="#fff" stroke="#18181b" strokeWidth="4" /><circle cx="548" cy="102" r="9" fill="#fff" stroke="#18181b" strokeWidth="4" />
      <g transform="translate(185 214)"><circle r="18" fill="#047857" /><path d="M-7 1h14M0-7v14" stroke="white" strokeWidth="3" strokeLinecap="round" /></g>
    </svg>
    <div className="absolute left-6 top-6 rounded-full border border-zinc-300 bg-white/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.14em] text-zinc-600 backdrop-blur">Live campus route</div>
    <div className="absolute bottom-5 left-5 right-5 grid grid-cols-3 divide-x divide-zinc-200 rounded-2xl border border-zinc-200 bg-white/95 px-2 py-4 backdrop-blur">
      <div className="px-3"><p className="font-mono text-[9px] uppercase tracking-[.14em] text-zinc-400">Orders</p><p className="mt-1 text-lg font-semibold">12</p></div>
      <div className="px-3"><p className="font-mono text-[9px] uppercase tracking-[.14em] text-zinc-400">Stops</p><p className="mt-1 text-lg font-semibold">3</p></div>
      <div className="px-3"><p className="font-mono text-[9px] uppercase tracking-[.14em] text-zinc-400">ETA</p><p className="mt-1 text-lg font-semibold">24m</p></div>
    </div>
  </div>
}

export function LandingPage() {
  const { session } = useApp()
  const workspace = session ? rolePath[session.activeRole] : '/login'
  return <div className="min-h-[100dvh] bg-[#f5f5f0] text-zinc-900">
    <header className="border-b border-zinc-200/90"><div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 md:px-8"><a href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 text-white"><BowlFood size={19} /></span>Courtyard</a><nav className="flex items-center gap-3 text-sm"><a href="#roles" className="hidden text-zinc-500 hover:text-zinc-900 sm:block">Workspaces</a><a href={workspace} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-zinc-900 px-4 font-semibold text-white transition hover:bg-zinc-800">{session ? 'Open workspace' : 'Sign in'}<ArrowRight size={16} /></a></nav></div></header>

    <main>
      <section className="mx-auto grid max-w-[1240px] gap-14 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[minmax(0,.92fr)_minmax(32rem,1.08fr)] lg:items-center">
        <div><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-emerald-800"><MapPin size={14} />Dormitory delivery coordination</div><h1 className="mt-6 max-w-[11ch] text-5xl font-semibold leading-[.94] tracking-[-.055em] md:text-7xl">One batch. One route. Everyone aligned.</h1><p className="mt-7 max-w-[56ch] text-base leading-relaxed text-zinc-600 md:text-lg">Courtyard groups ready food orders by dormitory, recommends a feasible delivery sequence and keeps administrators, merchants and shippers on the same live route.</p><div className="mt-9 flex flex-wrap items-center gap-3"><a href={workspace} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-800 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700">{session ? 'Continue to workspace' : 'Access your account'}<ArrowRight size={17} /></a><a href="#workflow" className="inline-flex min-h-12 items-center px-4 text-sm font-semibold text-zinc-600 hover:text-zinc-900">See how it works</a></div><div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-500"><span className="flex items-center gap-1.5"><CheckCircle size={15} className="text-emerald-700" />Role-based access</span><span className="flex items-center gap-1.5"><CheckCircle size={15} className="text-emerald-700" />Live route state</span><span className="flex items-center gap-1.5"><CheckCircle size={15} className="text-emerald-700" />One controlled redelivery</span></div></div>
        <RoutePreview />
      </section>

      <section id="roles" className="border-y border-zinc-200 bg-white"><div className="mx-auto max-w-[1240px] px-5 py-16 md:px-8 md:py-20"><div className="max-w-2xl"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-emerald-800">Three operator workspaces</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] md:text-5xl">The right view for each decision.</h2></div><div className="mt-12 grid border-y border-zinc-200 md:grid-cols-3 md:divide-x md:divide-zinc-200">{roles.map(({ icon: Icon, label, title, text, number }) => <article key={label} className="border-b border-zinc-200 py-7 last:border-b-0 md:border-b-0 md:px-7 md:first:pl-0 md:last:pr-0"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-zinc-100 text-zinc-700"><Icon size={20} /></span><span className="font-mono text-xs text-zinc-400">{number}</span></div><p className="mt-8 font-mono text-[10px] uppercase tracking-[.16em] text-emerald-800">{label}</p><h3 className="mt-2 text-xl font-semibold tracking-[-.025em]">{title}</h3><p className="mt-3 text-sm leading-relaxed text-zinc-500">{text}</p></article>)}</div></div></section>

      <section id="workflow" className="mx-auto max-w-[1240px] px-5 py-16 md:px-8 md:py-24"><div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-emerald-800">Operational flow</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] md:text-5xl">From ready meals to dormitory handoff.</h2></div><ol className="divide-y divide-zinc-200 border-y border-zinc-200">{[['01','Prepare','Merchant marks completed meals ready for batching.'],['02','Recommend','Courtyard validates and groups orders into one feasible building route.'],['03','Deliver','The approved shipper confirms the route and records every handoff.']].map(([step,title,text]) => <li key={step} className="grid gap-3 py-6 sm:grid-cols-[4rem_9rem_1fr] sm:items-baseline"><span className="font-mono text-xs text-zinc-400">{step}</span><strong className="text-sm">{title}</strong><span className="text-sm leading-relaxed text-zinc-500">{text}</span></li>)}</ol></div></section>

      <section className="border-t border-zinc-200"><div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-5 py-12 md:flex-row md:items-center md:justify-between md:px-8"><div><div className="flex items-center gap-2 text-sm font-semibold"><Buildings size={18} />Built for campus operations</div><p className="mt-2 text-sm text-zinc-500">Five separate demo accounts. Three focused operator portals. One shared route.</p></div><a href={workspace} className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold hover:border-zinc-500 md:self-auto">{session ? 'Return to workspace' : 'Sign in to Courtyard'}<ArrowRight size={16} /></a></div></section>
    </main>

    <footer className="border-t border-zinc-200"><div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-6 text-xs text-zinc-500 md:px-8"><span>Courtyard campus delivery</span><span className="font-mono">PostgreSQL · Fastify · React</span></div></footer>
  </div>
}
