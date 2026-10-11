"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Search, ShoppingCart, Ship } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, ErrorNotice, Input, Loading, PageHeader, Table, Td, Textarea, Th, fieldErrors } from "@/components/ui";
import { api, type Offer, type Order } from "@/lib/api";
import { capitalize, formatDate, formatMoney } from "@/lib/format";

type Supplier = { seller: Offer["seller"]; offers: Offer[] };

function SupplierCard({ supplier }: { supplier: Supplier }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const items = supplier.offers
    .map((o) => ({ offer: o, quantity: Number(qty[o.product.id]) || 0 }))
    .filter((i) => i.quantity > 0);
  const total = items.reduce((s, i) => s + i.quantity * i.offer.unit_price, 0);
  const place = useMutation({
    mutationFn: () =>
      api.post<Order>("/orders", {
        seller_id: supplier.seller.id,
        items: items.map((i) => ({ product_id: i.offer.product.id, quantity: i.quantity })),
        note,
      }),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Purchase order ${o.reference} sent to ${supplier.seller.name}`);
      router.push(`/app/orders/${o.id}`);
    },
  });
  const errs = fieldErrors(place.error);
  const Icon = supplier.seller.type === "manufacturer" ? Factory : Ship;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
            <Icon className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">{supplier.seller.name}</h2>
            <p className="text-sm text-slate-500">
              {capitalize(supplier.seller.type)} · {supplier.seller.city}
              {supplier.seller.phone && ` · ${supplier.seller.phone}`}
            </p>
          </div>
        </div>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Medicine</Th>
            <Th>Earliest expiry</Th>
            <Th className="text-right">Available</Th>
            <Th className="text-right">Price / pack</Th>
            <Th className="w-32 text-right">Order qty</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {supplier.offers.map((o) => {
            const itemIndex = items.findIndex((i) => i.offer.product.id === o.product.id);
            const err = itemIndex >= 0 ? errs[`items.${itemIndex}.quantity`] : undefined;
            return (
              <tr key={o.product.id}>
                <Td>
                  <p className="font-medium text-slate-900">
                    {o.product.name} {o.product.strength}
                  </p>
                  <p className="text-xs text-slate-500">
                    {o.product.generic_name} · {o.product.dosage_form}
                    {o.product.requires_prescription && " · Rx"}
                  </p>
                </Td>
                <Td>{formatDate(o.earliest_expiry)}</Td>
                <Td className="text-right tabular-nums">{o.available.toLocaleString()}</Td>
                <Td className="text-right tabular-nums">{formatMoney(o.unit_price, o.currency)}</Td>
                <Td className="text-right">
                  <Input
                    type="number"
                    min={0}
                    max={o.available}
                    value={qty[o.product.id] ?? ""}
                    placeholder="0"
                    onChange={(e) => setQty((q) => ({ ...q, [o.product.id]: e.target.value }))}
                    className="w-24 text-right"
                    aria-label={`Quantity of ${o.product.name}`}
                    error={err}
                  />
                  {err && <p className="mt-1 max-w-40 whitespace-normal text-left text-xs text-rose-600">{err}</p>}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {items.length > 0 && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          <Textarea label="Note to supplier (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery window, invoice details…" />
          {place.error && Object.keys(errs).length === 0 && <ErrorNotice error={place.error} />}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {items.reduce((s, i) => s + i.quantity, 0).toLocaleString()} packs ·{" "}
              <span className="font-semibold text-slate-900">{formatMoney(total, supplier.offers[0].currency)}</span>
            </p>
            <Button loading={place.isPending} onClick={() => place.mutate()}>
              <ShoppingCart className="size-4" /> Send purchase order
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function BuyStockPage() {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const offers = useQuery({
    queryKey: ["offers", "supply", dq],
    queryFn: () => api.get<Offer[]>("/market/offers", { side: "supply", q: dq }),
  });
  const suppliers = useMemo(() => {
    const map = new Map<string, Supplier>();
    for (const o of offers.data ?? []) {
      const s = map.get(o.seller.id) ?? { seller: o.seller, offers: [] };
      s.offers.push(o);
      map.set(o.seller.id, s);
    }
    return [...map.values()];
  }, [offers.data]);

  return (
    <RoleGate roles={["pharmacy"]}>
      <PageHeader
        title="Buy stock"
        description="Live stock from approved manufacturers and importers. When a supplier accepts, the packs arrive as a tracked shipment."
      />
      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search medicines" className="pl-9" aria-label="Search medicines" />
      </div>
      <ErrorNotice error={offers.error} className="mb-4" />
      {offers.isPending ? (
        <Loading />
      ) : suppliers.length === 0 ? (
        <Card>
          <EmptyState icon={<Factory className="size-6" />} title="No supplier stock found" body="Suppliers appear here once they price and list their stock." />
        </Card>
      ) : (
        <div className="space-y-6">
          {suppliers.map((s) => (
            <SupplierCard key={s.seller.id} supplier={s} />
          ))}
          <p className="text-center text-xs text-slate-500">
            <Badge tone="green">Genuine</Badge> Only in-date, non-recalled packs tracked in MediTrack are offered.
          </p>
        </div>
      )}
    </RoleGate>
  );
}
