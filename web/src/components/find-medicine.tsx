"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Car,
  Check,
  LocateFixed,
  Navigation,
  Phone,
  Pill,
  Route,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { api, type Offer, type Order } from "@/lib/api";
import { cn } from "@/lib/cn";
import { currentPosition, formatDate, formatDistance, formatMoney } from "@/lib/format";
import {
  byDistance,
  byPrice,
  drivingRoute,
  formatDuration,
  groupOffers,
  hasLocation,
  shortMoney,
  type LatLng,
  type MedicineGroup,
} from "@/lib/medicine";
import { useMe } from "@/lib/session";
import { FORM_ORDER, MedicineArt, artSeed, formLabel, type MedicineForm } from "./medicine-art";
import { PharmacyMap } from "./pharmacy-map";
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorNotice, Input, Loading, Modal, Notice, Textarea, fieldErrors } from "./ui";

const outlineButton =
  "inline-flex min-w-0 items-center justify-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50";

/** Browse medicines as pictures, then pick a pharmacy (nearest first) and see the route. */
export function FindMedicine() {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim());
  const [form, setForm] = useState<MedicineForm | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reserving, setReserving] = useState<Offer | null>(null);

  const offers = useQuery({
    queryKey: ["offers", "retail", dq, me?.lat, me?.lng],
    queryFn: () => api.get<Offer[]>("/market/offers", { side: "retail", q: dq, lat: me?.lat, lng: me?.lng }),
    placeholderData: (prev) => prev,
  });

  const locate = useCallback(async () => {
    setLocating(true);
    setLocError("");
    try {
      setMe(await currentPosition());
    } catch (e) {
      setLocError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }, []);

  // Use the location straight away when the browser already allows it; otherwise wait for a click.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((s) => {
        if (s.state === "granted") locate();
      })
      .catch(() => {});
  }, [locate]);

  const all = useMemo(() => groupOffers(offers.data ?? []), [offers.data]);
  const forms = useMemo(() => FORM_ORDER.filter((f) => all.some((g) => g.form === f)), [all]);
  const shown = form ? all.filter((g) => g.form === form) : all;
  const open = openId ? all.find((g) => g.product.id === openId) : undefined;
  const show = (id: string | null) => {
    setOpenId(id);
    window.scrollTo({ top: 0 });
  };

  if (open) {
    return (
      <>
        <MedicineDetail
          key={open.product.id}
          group={open}
          me={me}
          locating={locating}
          locError={locError}
          onLocate={locate}
          onBack={() => show(null)}
          onReserve={setReserving}
        />
        {reserving && <ReserveDialog offer={reserving} onClose={() => setReserving(null)} />}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, e.g. paracetamol"
            className="pl-9 pr-9"
            aria-label="Search medicine"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button variant={me ? "primary" : "secondary"} loading={locating} onClick={locate}>
          <LocateFixed className="size-4" /> {me ? "Nearest first" : "Use my location"}
        </Button>
      </div>
      {locError && <p className="mt-2 text-sm text-rose-600">{locError}</p>}

      {forms.length > 1 && (
        <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
          {[null, ...forms].map((f) => (
            <button
              key={f ?? "all"}
              type="button"
              onClick={() => setForm(f === form ? null : f)}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ring-1 ring-inset transition",
                form === f ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {f ? formLabel[f] : "All"}
            </button>
          ))}
        </div>
      )}

      <p className="mb-4 mt-4 flex items-center gap-1.5 text-sm font-medium text-slate-500">
        <Navigation className={cn("size-3.5", me ? "text-brand-600" : "text-slate-400")} />
        {offers.isPending
          ? "Searching pharmacies…"
          : `${shown.length} medicine${shown.length === 1 ? "" : "s"} ${me ? "· nearest first" : "in stock"}`}
      </p>

      <ErrorNotice error={offers.error} className="mb-4" />
      {offers.isPending ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Pill className="size-6" />}
            title={q ? "No pharmacy has this in stock" : "No medicines listed yet"}
            body={q ? "Try the generic name, e.g. paracetamol." : "Pharmacies appear here once they list their stock."}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {shown.map((g) => (
            <MedicineTile key={g.product.id} group={g} onOpen={() => show(g.product.id)} />
          ))}
        </div>
      )}
      <TrustLine />
      {reserving && <ReserveDialog offer={reserving} onClose={() => setReserving(null)} />}
    </>
  );
}

function TrustLine() {
  return (
    <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500">
      <ShieldCheck className="size-3.5" /> Only genuine, in-date, non-recalled stock tracked by MediTrack is shown.
    </p>
  );
}

function MedicineTile({ group: g, onOpen }: { group: MedicineGroup; onOpen: () => void }) {
  const p = g.product;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-3xl bg-white p-2 text-left shadow-sm ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-600"
    >
      <div className="relative">
        <MedicineArt dosageForm={p.dosage_form} seed={artSeed(p)} className="aspect-[4/3] w-full" />
        {p.requires_prescription && (
          <span className="absolute right-2 top-2 rounded-lg bg-white/95 px-2 py-0.5 text-[11px] font-extrabold text-sky-700">Rx</span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-2 pb-1.5 pt-2.5">
        <p className="truncate text-base font-semibold text-slate-900">{p.name}</p>
        <p className="truncate text-xs text-slate-500">
          {p.strength} · {p.dosage_form}
        </p>
        <p className="mt-2.5 text-sm text-slate-500">
          from <span className="font-extrabold text-slate-900">{shortMoney(g.minPrice, g.currency)}</span>
        </p>
        <div className="mt-1 flex items-center justify-between text-xs font-semibold">
          {g.nearestKm != null ? (
            <span className="inline-flex items-center gap-1 text-brand-700">
              <Navigation className="size-3" /> {formatDistance(g.nearestKm)}
            </span>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 text-slate-500" title={`${g.offers.length} pharmacies have it`}>
            <Store className="size-3.5" /> {g.offers.length}
          </span>
        </div>
      </div>
    </button>
  );
}

function MedicineDetail({
  group,
  me,
  locating,
  locError,
  onLocate,
  onBack,
  onReserve,
}: {
  group: MedicineGroup;
  me: LatLng | null;
  locating: boolean;
  locError: string;
  onLocate: () => void;
  onBack: () => void;
  onReserve: (o: Offer) => void;
}) {
  const p = group.product;
  const [sort, setSort] = useState<"nearest" | "cheapest">("nearest");
  const offers = useMemo(() => [...group.offers].sort(sort === "nearest" ? byDistance : byPrice), [group.offers, sort]);
  const nearestId = useMemo(
    () => [...group.offers].filter((o) => o.distance_km != null).sort(byDistance)[0]?.seller.id ?? null,
    [group.offers],
  );
  const cheapestId = useMemo(() => [...group.offers].sort(byPrice)[0].seller.id, [group.offers]);
  const [picked, setPicked] = useState<string | null>(null);
  // Until the patient picks one, the nearest pharmacy is selected (it updates once location arrives).
  const selectedId = picked ?? nearestId ?? group.offers[0].seller.id;
  const selected = group.offers.find((o) => o.seller.id === selectedId) ?? group.offers[0];
  const isNearest = selected.seller.id === nearestId;
  const isCheapest = selected.seller.id === cheapestId && group.offers.length > 1;

  const dest = hasLocation(selected.seller) ? { lat: selected.seller.latitude!, lng: selected.seller.longitude! } : null;
  const route = useQuery({
    queryKey: ["route", me?.lat, me?.lng, dest?.lat, dest?.lng],
    queryFn: () => drivingRoute(me!, dest!),
    enabled: !!me && !!dest,
    staleTime: Infinity,
  });

  const pins = useMemo(
    () =>
      group.offers.filter((o) => hasLocation(o.seller)).map((o) => ({
        id: o.seller.id,
        lat: o.seller.latitude!,
        lng: o.seller.longitude!,
        label: shortMoney(o.unit_price, o.currency),
        km: o.distance_km,
      })),
    [group.offers],
  );

  const km = route.data?.km ?? selected.distance_km;
  const routing = route.isFetching && !route.data;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> All medicines
      </button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-3xl shadow-sm ring-1 ring-slate-200">
            <PharmacyMap
              me={me}
              pins={pins}
              selectedId={selected.seller.id}
              route={route.data?.points ?? null}
              approximate={route.data?.approximate}
              onSelect={setPicked}
              className="h-72 sm:h-96 lg:h-[560px]"
            />
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <MedicineArt dosageForm={p.dosage_form} seed={artSeed(p)} className="size-24 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                {p.name} {p.strength}
              </h2>
              <p className="text-sm text-slate-500">{[p.generic_name, p.dosage_form, p.pack_size].filter(Boolean).join(" · ")}</p>
              {p.requires_prescription && (
                <Badge tone="blue" className="mt-2">
                  Prescription needed at pickup
                </Badge>
              )}
            </div>
          </div>

          {!me && (
            <Notice tone="blue" title="See the nearest pharmacy and the route">
              <p>{locError || "Share your location to sort pharmacies by distance and draw the way there."}</p>
              <Button size="sm" className="mt-3" loading={locating} onClick={onLocate}>
                <LocateFixed className="size-4" /> Use my location
              </Button>
            </Notice>
          )}

          {/* Selected pharmacy */}
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-brand-200">
            <div className="flex flex-wrap items-center gap-2">
              {isNearest && (
                <Badge tone="brand">
                  <Navigation className="mr-1 size-3" /> Nearest to you
                </Badge>
              )}
              {isCheapest && (
                <Badge tone="green">
                  <Tag className="mr-1 size-3" /> Best price
                </Badge>
              )}
              {!isNearest && !isCheapest && (
                <Badge tone="gray">
                  <Check className="mr-1 size-3" /> Selected
                </Badge>
              )}
            </div>
            <h3 className="mt-3 text-xl font-bold text-slate-900">{selected.seller.name}</h3>
            <p className="text-sm text-slate-500">{[selected.seller.address, selected.seller.city].filter(Boolean).join(", ")}</p>

            <div className="mt-4 grid grid-cols-3 divide-x divide-slate-200 rounded-2xl bg-slate-50 py-3 text-center">
              <StatCell
                icon={<Route className="size-4" />}
                label="Distance"
                value={routing ? "…" : km == null ? "—" : `${route.data?.approximate ? "≈ " : ""}${formatDistance(km)}`}
              />
              <StatCell
                icon={<Car className="size-4" />}
                label="Drive"
                value={route.data ? formatDuration(route.data.minutes) : routing ? "…" : "—"}
              />
              <StatCell icon={<Tag className="size-4" />} label="Price" value={shortMoney(selected.unit_price, selected.currency)} />
            </div>
            {selected.available <= 5 && (
              <p className="mt-3 text-sm font-semibold text-amber-700">Only {selected.available} left here. Reserve to hold one.</p>
            )}

            <Button size="lg" className="mt-4 w-full" onClick={() => onReserve(selected)}>
              <ShoppingBag className="size-4" /> Reserve for pickup
            </Button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {dest ? (
                <a
                  className={outlineButton}
                  href={`https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation className="size-4 shrink-0" /> <span className="truncate">Start navigation</span>
                </a>
              ) : (
                <Button variant="secondary" disabled>
                  <Navigation className="size-4" /> No map location
                </Button>
              )}
              {selected.seller.phone ? (
                <a className={outlineButton} href={`tel:${selected.seller.phone.replace(/\s/g, "")}`}>
                  <Phone className="size-4 shrink-0" /> <span className="truncate">{selected.seller.phone}</span>
                </a>
              ) : (
                <Button variant="secondary" disabled>
                  <Phone className="size-4" /> No phone
                </Button>
              )}
            </div>
          </div>

          {/* All pharmacies */}
          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Pharmacies</h3>
                <p className="text-xs text-slate-500">
                  {group.offers.length} {group.offers.length === 1 ? "has" : "have"} it in stock
                </p>
              </div>
              <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                {(["nearest", "cheapest"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSort(s)}
                    className={cn(
                      "rounded-lg px-3 py-1 capitalize transition",
                      sort === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <Card className="overflow-hidden">
              <ul className="divide-y divide-slate-100">
                {offers.map((o, i) => {
                  const isSel = o.seller.id === selected.seller.id;
                  const nearestHere = o.seller.id === nearestId;
                  const cheapestHere = o.seller.id === cheapestId && group.offers.length > 1;
                  return (
                    <li key={o.seller.id}>
                      <button
                        type="button"
                        onClick={() => setPicked(o.seller.id)}
                        className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition", isSel ? "bg-brand-50" : "hover:bg-slate-50")}
                      >
                        <span
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold",
                            isSel ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500",
                          )}
                        >
                          {isSel ? <Check className="size-4" /> : i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">{o.seller.name}</span>
                          <span className={cn("block truncate text-xs", o.available <= 5 ? "text-amber-700" : "text-slate-500")}>
                            {[
                              o.distance_km != null ? formatDistance(o.distance_km) : null,
                              o.seller.city,
                              o.available <= 5 ? `only ${o.available} left` : `${o.available} in stock`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {(nearestHere || cheapestHere) && (
                            <span className="mt-1 flex gap-1.5">
                              {nearestHere && <Badge tone="brand">Nearest</Badge>}
                              {cheapestHere && <Badge tone="green">Cheapest</Badge>}
                            </span>
                          )}
                        </span>
                        <span className={cn("text-sm font-extrabold tabular-nums", isSel ? "text-brand-800" : "text-slate-900")}>
                          {shortMoney(o.unit_price, o.currency)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
          <TrustLine />
        </div>
      </div>
    </div>
  );
}

function StatCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="px-2">
      <div className="flex justify-center text-brand-600">{icon}</div>
      <p className="mt-1 truncate text-sm font-extrabold text-slate-900">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
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
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={reserve.isPending} onClick={() => reserve.mutate()}>
              Reserve · {formatMoney(offer.unit_price * qty, offer.currency)}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <MedicineArt dosageForm={offer.product.dosage_form} seed={artSeed(offer.product)} className="size-14 shrink-0" rounded="rounded-xl" />
          <div>
            <p className="font-medium text-slate-900">
              {offer.product.name} {offer.product.strength}
            </p>
            <p className="text-slate-500">
              {formatMoney(offer.unit_price, offer.currency)} per pack · {offer.available} available · expires {formatDate(offer.earliest_expiry)} or later
            </p>
          </div>
        </div>
        {!me ? (
          <Notice tone="blue" title="Sign in to reserve">
            <p>Reservations need a free patient account so the pharmacy can confirm with you.</p>
            <div className="mt-3 flex gap-2">
              <ButtonLink href={`/login?next=${encodeURIComponent(pathname)}`} size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" size="sm" variant="secondary">
                Create account
              </ButtonLink>
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
            <Textarea
              label="Note for the pharmacy (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. I'll collect after 5pm"
            />
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
