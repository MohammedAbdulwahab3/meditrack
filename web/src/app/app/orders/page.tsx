"use client";

import { MedicineArt, artSeed } from "@/components/medicine-art";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ClipboardList, Pill, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { StatusBadge } from "@/components/status";
import { ButtonLink, Card, EmptyState, ErrorNotice, Loading, PageHeader, Pagination, Select, Table, Td, Th, cn } from "@/components/ui";
import { api, type Order, type Page } from "@/lib/api";
import { formatMoney, timeAgo } from "@/lib/format";
import { useMe } from "@/lib/session";

function OrdersView() {
  const params = useSearchParams();
  const { data: me } = useMe();
  const role = me?.user.role;
  // Pharmacies both sell (to patients) and buy (from suppliers); others do one or the other.
  const sides = role === "pharmacy" ? (["selling", "buying"] as const) : role === "patient" ? (["buying"] as const) : (["selling"] as const);
  const [side, setSide] = useState<string>(params.get("side") ?? sides[0]);
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const orders = useQuery({
    queryKey: ["orders", { side: role === "admin" ? "" : side, status, offset }],
    queryFn: () => api.get<Page<Order>>("/orders", { side: role === "admin" ? "" : side, status, offset }),
    placeholderData: keepPreviousData,
    enabled: !!me,
  });

  const title = role === "patient" ? "My orders" : role === "pharmacy" ? "Orders" : "Incoming orders";
  const description =
    role === "patient"
      ? "Medicines you reserved. Pay at the pharmacy when you collect."
      : role === "pharmacy"
        ? "Customer reservations, and the stock you've ordered from suppliers."
        : "Purchase orders from pharmacies. Accepting one ships the packs automatically.";
  const tabLabel = (s: string) => (role === "pharmacy" ? (s === "selling" ? "Customer orders" : "Purchase orders") : "");
  const counterparty = (o: Order) => (side === "selling" ? o.buyer : o.seller);

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          role === "patient" ? (
            <ButtonLink href="/app/find"><Pill className="size-4" /> Find medicine</ButtonLink>
          ) : role === "pharmacy" ? (
            <ButtonLink href="/app/buy"><ShoppingCart className="size-4" /> Buy stock</ButtonLink>
          ) : undefined
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          {sides.length > 1 && (
            <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
              {sides.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSide(s);
                    setOffset(0);
                  }}
                  className={cn("rounded-md px-3 py-1.5", side === s ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-800")}
                >
                  {tabLabel(s)}
                </button>
              ))}
            </div>
          )}
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
            className="w-48"
            aria-label="Status"
          >
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            {(role === "patient" || (role === "pharmacy" && side === "selling")) && (
              <>
                <option value="confirmed">Ready for pickup</option>
                <option value="completed">Completed</option>
              </>
            )}
            {role !== "patient" && !(role === "pharmacy" && side === "selling") && (
              <>
                <option value="accepted">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="returned">Returned</option>
              </>
            )}
            <option value="rejected">Declined</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <ErrorNotice error={orders.error} className="m-4" />
        {orders.isPending ? (
          <Loading />
        ) : !orders.data?.items.length ? (
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title="No orders yet"
            body={
              role === "patient"
                ? "Find a medicine and reserve it at a pharmacy near you."
                : side === "buying"
                  ? "Order stock from manufacturers and importers under Buy stock."
                  : "Orders appear here once buyers find your listed products. Set your prices under Prices & listings."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>{side === "selling" ? "Buyer" : "From"}</Th>
                <Th>Items</Th>
                <Th className="text-right">Total</Th>
                <Th>Placed</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.data.items.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/app/orders/${o.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {o.reference}
                    </Link>
                  </Td>
                  <Td>
                    <p className="text-slate-900">{counterparty(o).name}</p>
                    <p className="text-xs text-slate-500">{counterparty(o).city || counterparty(o).phone}</p>
                  </Td>
                  <Td className="max-w-72">
                    <div className="flex items-center gap-2.5">
                      {o.items[0] && (
                        <MedicineArt dosageForm={o.items[0].dosage_form} seed={artSeed(o.items[0])} className="size-9 shrink-0" rounded="rounded-lg" />
                      )}
                      <span className="truncate">{o.items.map((i) => `${i.quantity}× ${i.name} ${i.strength}`).join(", ")}</span>
                    </div>
                  </Td>
                  <Td className="text-right font-medium tabular-nums">{formatMoney(o.total, o.currency)}</Td>
                  <Td>{timeAgo(o.created_at)}</Td>
                  <Td>
                    <StatusBadge status={o.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={orders.data} onChange={setOffset} />
      </Card>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersView />
    </Suspense>
  );
}
