"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { LocateFixed, MapPin, Navigation, Pill, Search, ShieldCheck, Store } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { api, type Offer, type Order } from "@/lib/api";
import { currentPosition, formatDate, formatDistance, formatMoney } from "@/lib/format";
import { useMe } from "@/lib/session";
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorNotice, Input, Loading, Modal, Notice, Textarea, fieldErrors } from "./ui";

type ProductGroup = { product: Offer["product"]; offers: Offer[] };

function availabilityLabel(n: number) {
  if (n <= 5) return <Badge tone="amber">Only {n} left</Badge>;
  return <Badge tone="green">In stock</Badge>;
}

/** Search medicines across all pharmacies, see prices and stock, and reserve for pickup. */
export function FindMedicine() {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const dq = useDeferredValue(q);
  const dcity = useDeferredValue(city);
  const [reserving, setReserving] = useState<Offer | null>(null);
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  const offers = useQuery({
    queryKey: ["offers", "retail", dq, dcity, near?.lat, near?.lng],
    queryFn: () => api.get<Offer[]>("/market/offers", { side: "retail", q: dq, city: dcity, lat: near?.lat, lng: near?.lng }),
  });

  const locate = async () => {
    setLocating(true);
    setLocError("");
    try {
      setNear(await currentPosition());
    } catch (e) {
      setLocError((e as Error).message);
    } finally {
      setLocating(false);
    }
  };

  const groups = useMemo(() => {
    const byProduct = new Map<string, ProductGroup>();
    for (const o of offers.data ?? []) {
      const g = byProduct.get(o.product.id) ?? { product: o.product, offers: [] };
      g.offers.push(o);
      byProduct.set(o.product.id, g);
    }
    return [...byProduct.values()];
  }, [offers.data]);

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-[2]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a medicine, e.g. amoxicillin" className="pl-9" aria-label="Search medicine" />
        </div>
        <div className="relative min-w-44 flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="pl-9" aria-label="City" />
        </div>
        <Button variant={near ? "primary" : "secondary"} loading={locating} onClick={near ? () => setNear(null) : locate}>
          <LocateFixed className="size-4" /> {near ? "Nearest first" : "Near me"}
        </Button>
      </div>
      {locError && <p className="-mt-4 mb-4 text-sm text-rose-600">{locError}</p>}

      <ErrorNotice error={offers.error} className="mb-4" />
      {offers.isPending ? (
        <Loading />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Pill className="size-6" />}
            title={q || city ? "No pharmacy has this in stock" : "No medicines listed yet"}
            body={q || city ? "Try another name or city." : "Pharmacies appear here once they list their stock."}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const cheapest = Math.min(...g.offers.map((o) => o.unit_price));
            return (
              <Card key={g.product.id}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      {g.product.name} {g.product.strength}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {g.product.generic_name} · {g.product.dosage_form}
                      {g.product.pack_size && ` · ${g.product.pack_size}`} · by {g.product.manufacturer_name}
                    </p>
                    {g.product.requires_prescription && (
                      <Badge tone="blue" className="mt-2">Prescription required at pickup</Badge>
                    )}
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-slate-500">from</p>
                    <p className="text-lg font-bold text-slate-900">{formatMoney(cheapest, g.offers[0].currency)}</p>
                    <p className="text-xs text-slate-500">
                      at {g.offers.length} pharmac{g.offers.length === 1 ? "y" : "ies"}
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-slate-100">
                  {g.offers.map((o) => (
                    <li key={o.seller.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="rounded-lg bg-brand-50 p-2 text-brand-700">
                          <Store className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">{o.seller.name}</p>
                          <p className="text-xs text-slate-500">
                            {o.distance_km != null && <span className="font-semibold text-brand-700">{formatDistance(o.distance_km)} · </span>}
                            {[o.seller.address, o.seller.city].filter(Boolean).join(", ")}
                            {o.seller.phone && ` · ${o.seller.phone}`}
                          </p>
                          {o.seller.latitude != null && o.seller.longitude != null && (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${o.seller.latitude},${o.seller.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand-700"
                            >
                              <Navigation className="size-3" /> Directions
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {availabilityLabel(o.available)}
                        <span className="w-28 text-right font-semibold tabular-nums">{formatMoney(o.unit_price, o.currency)}</span>
                        <Button size="sm" onClick={() => setReserving(o)}>
                          Reserve
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="size-3.5" /> Only genuine, in-date, non-recalled stock tracked by MediTrack is shown.
          </p>
        </div>
      )}

      {reserving && <ReserveDialog offer={reserving} onClose={() => setReserving(null)} />}
    </>
  );
}

function ReserveDialog({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me } = useMe();
  const max = Math.min(offer.available, 50);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const reserve = useMutation({
    mutationFn: () =>
      api.post<Order>("/orders", { seller_id: offer.seller.id, items: [{ product_id: offer.product.id, quantity: qty }], note }),
    onSuccess: (o) => router.push(`/app/orders/${o.id}`),
  });
  const errs = fieldErrors(reserve.error);
  const canOrder = me?.user.role === "patient";

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reserve at ${offer.seller.name}`}
      footer={
        canOrder ? (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={reserve.isPending} onClick={() => reserve.mutate()}>
              Reserve · {formatMoney(offer.unit_price * qty, offer.currency)}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-medium text-slate-900">
            {offer.product.name} {offer.product.strength}
          </p>
          <p className="text-slate-500">
            {formatMoney(offer.unit_price, offer.currency)} per pack · {offer.available} available · expires {formatDate(offer.earliest_expiry)} or later
          </p>
        </div>
        {!me ? (
          <Notice tone="blue" title="Sign in to reserve">
            <p>Reservations need a free patient account so the pharmacy can confirm with you.</p>
            <div className="mt-3 flex gap-2">
              <ButtonLink href={`/login?next=${encodeURIComponent(pathname)}`} size="sm">Sign in</ButtonLink>
              <ButtonLink href="/register" size="sm" variant="secondary">Create account</ButtonLink>
            </div>
          </Notice>
        ) : !canOrder ? (
          <Notice tone="amber" title="Patient accounts only">
            Business accounts order stock from suppliers under Buy stock.
          </Notice>
        ) : (
          <>
            <Input
              label="Packs"
              type="number"
              min={1}
              max={max}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
              error={errs["items.0.quantity"]}
            />
            <Textarea label="Note for the pharmacy (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I'll collect after 5pm" />
            {offer.product.requires_prescription && (
              <Notice tone="blue">This is a prescription medicine. Bring your prescription when you collect it.</Notice>
            )}
            <p className="text-xs text-slate-500">You pay at the pharmacy when you collect. The pharmacy confirms first and holds the medicine for you.</p>
            {reserve.error && Object.keys(errs).length === 0 && <ErrorNotice error={reserve.error} />}
          </>
        )}
      </div>
    </Modal>
  );
}
