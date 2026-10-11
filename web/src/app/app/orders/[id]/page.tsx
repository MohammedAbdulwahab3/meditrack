"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, PackageCheck, Truck, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Button, ButtonLink, Card, CardHeader, ErrorNotice, Loading, Modal, Notice, PageHeader, Table, Td, Textarea, Th, fieldErrors } from "@/components/ui";
import { api, type Order } from "@/lib/api";
import { capitalize, formatDate, formatDateTime, formatMoney, normalizeCode } from "@/lib/format";
import { useMe } from "@/lib/session";

const retailSteps = ["pending", "confirmed", "completed"] as const;
const wholesaleSteps = ["pending", "accepted", "delivered"] as const;
const stepLabels: Record<string, string> = {
  pending: "Placed",
  confirmed: "Ready for pickup",
  completed: "Collected",
  accepted: "Shipped",
  delivered: "Delivered",
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const order = useQuery({ queryKey: ["orders", id], queryFn: () => api.get<Order>(`/orders/${id}`) });

  const act = useMutation({
    mutationFn: (action: "accept" | "reject" | "cancel" | "complete") =>
      api.post<Order>(`/orders/${id}/${action}`, action === "reject" ? { reason } : {}),
    onSuccess: (o) => {
      qc.setQueryData(["orders", id], o);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["shipments"] });
      setDeclineOpen(false);
      const messages: Record<string, string> = {
        confirmed: "Confirmed — the medicine is held for the customer.",
        accepted: "Accepted — a shipment was created and sent.",
        completed: "Completed — packs recorded as dispensed.",
        rejected: "Order declined.",
        cancelled: "Order cancelled.",
      };
      toast.success(messages[o.status] ?? "Updated");
    },
  });

  const o = order.data;
  if (order.isPending) return <Loading />;
  if (!o) return <ErrorNotice error={order.error} />;

  const isSeller = me?.organization?.id === o.seller.id;
  const isBuyer = me?.user.role === "patient" ? o.kind === "retail" : me?.organization?.id === o.buyer.id;
  const steps = o.kind === "retail" ? retailSteps : wholesaleSteps;
  const stepIndex = steps.indexOf(o.status as never);
  const closedBad = ["rejected", "cancelled", "returned"].includes(o.status);

  return (
    <>
      <PageHeader
        back={{ href: "/app/orders", label: "Orders" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {o.reference} <StatusBadge status={o.status} />
          </span>
        }
        description={`${o.kind === "retail" ? "Pickup reservation" : "Purchase order"} · placed ${formatDateTime(o.created_at)}`}
        actions={
          <>
            {isBuyer && (o.status === "pending" || (o.kind === "retail" && o.status === "confirmed")) && (
              <Button variant="secondary" loading={act.isPending && act.variables === "cancel"} onClick={() => act.mutate("cancel")}>
                Cancel order
              </Button>
            )}
            {isSeller && (o.status === "pending" || (o.kind === "retail" && o.status === "confirmed")) && (
              <Button variant="secondary" onClick={() => setDeclineOpen(true)}>
                <X className="size-4" /> Decline
              </Button>
            )}
            {isSeller && o.status === "pending" && (
              <Button loading={act.isPending && act.variables === "accept"} onClick={() => act.mutate("accept")}>
                {o.kind === "retail" ? (
                  <>
                    <Check className="size-4" /> Confirm & hold stock
                  </>
                ) : (
                  <>
                    <Truck className="size-4" /> Accept & ship
                  </>
                )}
              </Button>
            )}
            {isSeller && o.kind === "retail" && o.status === "confirmed" && (
              <Button loading={act.isPending && act.variables === "complete"} onClick={() => act.mutate("complete")}>
                <PackageCheck className="size-4" /> Customer collected & paid
              </Button>
            )}
          </>
        }
      />
      <ErrorNotice error={act.error && !declineOpen ? act.error : null} className="mb-4" />

      {/* Progress */}
      {!closedBad ? (
        <Card className="mb-6 px-5 py-4">
          <ol className="flex items-center gap-2">
            {steps.map((s, i) => (
              <li key={s} className="flex flex-1 items-center gap-2">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    i <= stepIndex ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {i < stepIndex || o.status === steps[steps.length - 1] ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={`text-sm ${i <= stepIndex ? "font-medium text-slate-900" : "text-slate-400"}`}>{stepLabels[s]}</span>
                {i < steps.length - 1 && <span className={`h-px flex-1 ${i < stepIndex ? "bg-brand-400" : "bg-slate-200"}`} />}
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <Notice tone="red" title={`This order was ${o.status === "rejected" ? "declined" : o.status}`} className="mb-6">
          {o.decline_reason || (o.status === "returned" ? "The pharmacy rejected the shipment; the packs went back to the supplier." : undefined)}
        </Notice>
      )}

      {o.kind === "retail" && isBuyer && o.status === "confirmed" && (
        <Notice tone="green" title="Ready for pickup" className="mb-6">
          Go to {o.seller.name}
          {o.seller.address && `, ${o.seller.address}`}, {o.seller.city}. Show reference <strong>{o.reference}</strong> and pay{" "}
          {formatMoney(o.total, o.currency)} at the counter.
          {o.requires_prescription && " Bring your prescription."}
        </Notice>
      )}
      {o.kind === "retail" && isSeller && o.status === "confirmed" && o.requires_prescription && (
        <Notice tone="blue" title="Prescription medicine" className="mb-6">
          Check the customer&apos;s prescription before handing over.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Items" />
          <Table>
            <thead>
              <tr>
                <Th>Medicine</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Unit price</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {o.items.map((i) => (
                <tr key={i.product_id}>
                  <Td>
                    <p className="font-medium text-slate-900">
                      {i.name} {i.strength}
                    </p>
                    <p className="text-xs text-slate-500">
                      {i.dosage_form}
                      {i.requires_prescription && " · Prescription"}
                    </p>
                  </Td>
                  <Td className="text-right tabular-nums">{i.quantity}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(i.unit_price, o.currency)}</Td>
                  <Td className="text-right font-medium tabular-nums">{formatMoney(i.line_total, o.currency)}</Td>
                </tr>
              ))}
              <tr>
                <Td className="font-semibold text-slate-900">Total</Td>
                <Td />
                <Td />
                <Td className="text-right font-bold tabular-nums text-slate-900">{formatMoney(o.total, o.currency)}</Td>
              </tr>
            </tbody>
          </Table>
          {o.note && <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">Note: {o.note}</p>}
        </Card>

        <div className="space-y-6">
          {[
            [o.kind === "retail" ? "Pharmacy" : "Supplier", o.seller],
            [o.kind === "retail" ? "Customer" : "Pharmacy", o.buyer],
          ].map(([label, p]) => {
            const party = p as Order["buyer"];
            return (
              <Card key={label as string} className="p-5 text-sm">
                <p className="text-xs uppercase tracking-wide text-slate-400">{label as string}</p>
                <p className="mt-1 font-semibold text-slate-900">{party.name}</p>
                <p className="text-slate-500">{capitalize(party.type)}</p>
                {party.address && <p className="mt-2 text-slate-600">{party.address}</p>}
                {party.city && <p className="text-slate-600">{party.city}</p>}
                {party.phone && <p className="mt-1 text-slate-600">{party.phone}</p>}
              </Card>
            );
          })}
          {o.shipment_id && (
            <ButtonLink href={`/app/shipments/${o.shipment_id}`} variant="secondary" className="w-full">
              <Truck className="size-4" /> View shipment
            </ButtonLink>
          )}
        </div>
      </div>

      {o.packs.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Packs handed over" description="Each pack's own code. Tap one to verify it." />
          <ul className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {o.packs.map((p) => (
              <li key={p.code}>
                <Link
                  href={`/v/${normalizeCode(p.code)}`}
                  target="_blank"
                  className="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  <span>
                    <span className="block font-mono text-sm font-semibold">{p.code}</span>
                    <span className="text-xs text-slate-500">
                      {p.product_name} · {p.batch_number} · exp {formatDate(p.expires_on)}
                    </span>
                  </span>
                  <ExternalLink className="size-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title={`Decline ${o.reference}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>Back</Button>
            <Button variant="danger" loading={act.isPending} onClick={() => act.mutate("reject")}>Decline order</Button>
          </>
        }
      >
        <Textarea
          label="Reason (shown to the buyer)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={fieldErrors(act.error).reason}
          placeholder="e.g. Out of stock until next week"
        />
      </Modal>
    </>
  );
}
