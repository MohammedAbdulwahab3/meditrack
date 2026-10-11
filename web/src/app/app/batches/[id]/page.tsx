"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Printer, Truck } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { BatchStateBadge, StatusBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Loading,
  Modal,
  Notice,
  PageHeader,
  Table,
  Td,
  Textarea,
  Th,
  fieldErrors,
} from "@/components/ui";
import { api, type BatchDetail } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useMe } from "@/lib/session";

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const isAdmin = me?.user.role === "admin";
  const qc = useQueryClient();
  const toast = useToast();
  const [recallOpen, setRecallOpen] = useState(false);
  const [reason, setReason] = useState("");
  const batch = useQuery({ queryKey: ["batches", id], queryFn: () => api.get<BatchDetail>(`/batches/${id}`) });
  const recall = useMutation({
    mutationFn: () => api.post<BatchDetail>(`/batches/${id}/recall`, { reason }),
    onSuccess: (b) => {
      qc.setQueryData(["batches", id], b);
      qc.invalidateQueries({ queryKey: ["batches"] });
      setRecallOpen(false);
      toast.success("Batch recalled. Every holder has been alerted.");
    },
  });

  const b = batch.data;
  const d = b?.distribution;
  return (
    <RoleGate roles={["manufacturer", "admin"]}>
      {batch.isPending ? (
        <Loading />
      ) : !b || !d ? (
        <ErrorNotice error={batch.error} />
      ) : (
        <>
          <PageHeader
            back={{ href: "/app/batches", label: "Batches" }}
            title={
              <span className="flex flex-wrap items-center gap-3">
                Batch {b.batch_number} <BatchStateBadge recalled={!!b.recalled_at} expiresOn={b.expires_on} />
              </span>
            }
            description={`${b.product.name} ${b.product.strength} · ${b.product.dosage_form}${isAdmin ? ` · ${b.manufacturer_name}` : ""}`}
            actions={
              <>
                {!b.recalled_at && (
                  <Button variant="danger" onClick={() => setRecallOpen(true)}>
                    <Ban className="size-4" /> Recall batch
                  </Button>
                )}
                {!isAdmin && (
                  <>
                    <ButtonLink href={`/app/batches/${b.id}/labels`} variant="secondary">
                      <Printer className="size-4" /> Print labels
                    </ButtonLink>
                    {!b.recalled_at && d.with_manufacturer > 0 && (
                      <ButtonLink href={`/app/shipments/new?batch=${b.id}`}>
                        <Truck className="size-4" /> Ship packs
                      </ButtonLink>
                    )}
                  </>
                )}
              </>
            }
          />

          {b.recalled_at && (
            <Notice tone="red" title={`Recalled on ${formatDateTime(b.recalled_at)}`} className="mb-6">
              {b.recall_reason}
            </Notice>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["With manufacturer", d.with_manufacturer, "bg-slate-300"],
              ["In transit", d.in_transit, "bg-sky-400"],
              ["With importers & pharmacies", d.with_partners, "bg-brand-400"],
              ["Dispensed to patients", d.dispensed, "bg-brand-700"],
            ].map(([label, n, cls]) => (
              <Card key={label as string} className="p-5">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className={`size-2.5 rounded-full ${cls}`} /> {label}
                </div>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatNumber(n as number)}</p>
                <p className="text-xs text-slate-400">{Math.round(((n as number) / b.quantity) * 100)}% of {formatNumber(b.quantity)}</p>
              </Card>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Where the packs are now" description="Organizations currently holding packs from this batch." />
              {b.holdings.length === 0 ? (
                <EmptyState title="No packs held" body="All packs have been dispensed." />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Organization</Th>
                      <Th>Type</Th>
                      <Th>City</Th>
                      <Th className="text-right">In stock</Th>
                      <Th className="text-right">Shipping out</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {b.holdings.map((h) => (
                      <tr key={h.organization_id}>
                        <Td className="font-medium text-slate-900">{h.organization_name}</Td>
                        <Td><StatusBadge status={h.organization_type} /></Td>
                        <Td>{h.city}</Td>
                        <Td className="text-right tabular-nums">{formatNumber(h.in_stock)}</Td>
                        <Td className="text-right tabular-nums">{formatNumber(h.in_transit)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
            <Card>
              <CardHeader title="Details" />
              <dl className="divide-y divide-slate-100 px-5 text-sm">
                {[
                  ["Manufactured", formatDate(b.manufactured_on)],
                  ["Expires", formatDate(b.expires_on)],
                  ["Packs", formatNumber(b.quantity)],
                  ["Created", formatDateTime(b.created_at)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-3">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <Modal
            open={recallOpen}
            onClose={() => setRecallOpen(false)}
            title={`Recall batch ${b.batch_number}?`}
            footer={
              <>
                <Button variant="secondary" onClick={() => setRecallOpen(false)}>Cancel</Button>
                <Button variant="danger" loading={recall.isPending} onClick={() => recall.mutate()}>Recall batch</Button>
              </>
            }
          >
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                This can&apos;t be undone. {formatNumber(b.holdings.length)} organization(s) holding packs will be alerted, pharmacies
                won&apos;t be able to dispense them, and anyone scanning a pack will see the recall.
              </p>
              <Textarea
                label="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                error={fieldErrors(recall.error).reason}
                placeholder="e.g. Out-of-specification dissolution result in stability testing"
              />
              {recall.error && !fieldErrors(recall.error).reason && <ErrorNotice error={recall.error} />}
            </div>
          </Modal>
        </>
      )}
    </RoleGate>
  );
}
