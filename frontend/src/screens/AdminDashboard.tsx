import { useEffect, useState } from "react";
import { Check, ShieldCheck, Storefront, X } from "@phosphor-icons/react";
import { RouteOverview } from "../components/RouteOverview";
import { Button, SectionHeading, StatusBadge } from "../components/Ui";
import { useApp } from "../state/AppContext";

export function AdminDashboard() {
  const { data, actions, reviewMerchant } = useApp();
  const routes = data.trips?.length ? data.trips : data.trip ? [data.trip] : [];
  const [selectedTripId, setSelectedTripId] = useState(routes[0]?.id ?? "");
  const selectedTrip =
    routes.find((trip) => trip.id === selectedTripId) ?? routes[0] ?? null;
  const pendingCount = data.merchants.filter(
    (merchant) => merchant.status === "PENDING",
  ).length;
  const sorted = [...data.merchants].sort((a, b) =>
    a.status === "PENDING"
      ? -1
      : b.status === "PENDING"
        ? 1
        : a.name.localeCompare(b.name),
  );

  useEffect(() => {
    if (routes.length && !routes.some((trip) => trip.id === selectedTripId))
      setSelectedTripId(routes[0].id);
  }, [routes, selectedTripId]);

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-emerald-800">
            <ShieldCheck size={14} />
            Admin control
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] md:text-5xl">
            Merchants and live delivery.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Approve merchant access and monitor every active delivery.
          </p>
        </div>
        <div className="border-l border-zinc-300 pl-5">
          <p className="font-mono text-2xl font-semibold">{pendingCount}</p>
          <p className="text-xs text-zinc-500">awaiting review</p>
        </div>
      </header>

      <section>
        <SectionHeading
          eyebrow="Live routes"
          title={selectedTrip ? selectedTrip.id : "No shipper on route"}
          aside={
            routes.length > 1 ? (
              <label className="flex items-center gap-2 text-xs text-zinc-500">
                <span>Route</span>
                <select
                  aria-label="Choose active delivery route"
                  value={selectedTrip?.id ?? ""}
                  onChange={(event) => setSelectedTripId(event.target.value)}
                  className="min-h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
                >
                  {routes.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {data.merchants.find(
                        (merchant) => merchant.id === trip.merchantId,
                      )?.name ?? trip.merchantId}{" "}
                      · {trip.shipperName}
                    </option>
                  ))}
                </select>
              </label>
            ) : undefined
          }
        />
        <RouteOverview trip={selectedTrip} buildings={data.buildings} />
      </section>

      <section>
        <SectionHeading
          eyebrow="Access control"
          title="Merchant accounts"
          aside={
            <span className="font-mono text-xs text-zinc-500">
              {sorted.length} merchants
            </span>
          }
        />
        <div className="divide-y divide-zinc-200 border-y border-zinc-200">
          {sorted.map((merchant) => {
            const reviewing = actions[`merchant-${merchant.id}`] === "loading";
            return (
              <article
                key={merchant.id}
                className="grid gap-4 py-5 md:grid-cols-[2.5rem_minmax(0,1fr)_auto] md:items-center"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-zinc-600">
                  <Storefront size={18} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{merchant.name}</h3>
                    <StatusBadge status={merchant.status} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {merchant.ownerName} · {merchant.ownerEmail}
                  </p>
                  <p className="mt-2 text-sm text-zinc-600">
                    {merchant.description}
                  </p>
                </div>
                <div className="flex gap-2 md:justify-end">
                  {merchant.status !== "APPROVED" && (
                    <Button
                      aria-label={`Approve ${merchant.name}`}
                      busy={reviewing}
                      onClick={() =>
                        void reviewMerchant(merchant.id, "APPROVED")
                      }
                    >
                      <Check size={16} />
                      Approve
                    </Button>
                  )}
                  {merchant.status === "PENDING" && (
                    <Button
                      aria-label={`Reject ${merchant.name}`}
                      tone="secondary"
                      disabled={reviewing}
                      onClick={() =>
                        void reviewMerchant(merchant.id, "REJECTED")
                      }
                    >
                      <X size={16} />
                      Reject
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
