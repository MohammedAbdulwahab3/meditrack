"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { StatusBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, ErrorNotice, Loading, Modal, Notice, PageHeader, Table, Td, Textarea, Th, fieldErrors } from "@/components/ui";
import { api, type Shipment } from "@/lib/api";
import { capitalize, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useMe } from "@/lib/session";

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const shipment = useQuery({ queryKey: ["shipments", id], queryFn: () => api.get<Shipment>(`/shipments/${id}`) });

  const act = useMutation({
    mutationFn: (action: "receive" | "reject" | "cancel") => api.post<Shipment>(`/shipments/${id}/${action}`, action === "reject" ? { reason } : {}),
    onSuccess: (s) => {
      qc.setQueryData(["shipments", id], s);
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setRejectOpen(false);
      toast.success(
        s.status === "received" ? `${formatNumber(s.total_units)} packs added to your inventory` : `Shipment ${s.status}`,
      );
    },
  });

  const s = shipment.data;
  const myOrg = me?.organization?.id;
  const isRecipient = s?.to.id === myOrg;
  const isSender = s?.from.id === myOrg;
  const open = s?.status === "in_transit";
  const hasRecalled = s?.lines?.some((l) => l.recalled);

  return (
    <RoleGate roles={["manufacturer", "importer", "pharmacy", "admin"]}>
      {shipment.isPending ? (
        <Loading />
      ) : !s ? (
        <ErrorNotice error={shipment.error} />
      ) : (
        <>
          <PageHeader
            back={{ href: "/app/shipments", label: "Shipments" }}
            title={
              <span className="flex flex-wrap items-center gap-3">
                {s.reference} <StatusBadge status={s.status} />
              </span>
            }
            description={`Sent ${formatDateTime(s.created_at)}${s.closed_at ? ` · closed ${formatDateTime(s.closed_at)}` : ""}`}
            actions={
              open && (
                <>
                  {isSender && (
                    <Button variant="secondary" loading={act.isPending && act.variables === "cancel"} onClick={() => act.mutate("cancel")}>
                      Cancel shipment
                    </Button>
                  )}
                  {isRecipient && (
                    <>
                      <Button variant="secondary" onClick={() => setRejectOpen(true)}>
                        <X className="size-4" /> Reject
                      </Button>
                      <Button loading={act.isPending && act.variables === "receive"} onClick={() => act.mutate("receive")}>
                        <Check className="size-4" /> Receive {formatNumber(s.total_units)} packs
                      </Button>
                    </>
                  )}
                </>
              )
            }
          />
          <ErrorNotice error={act.error && !rejectOpen ? act.error : null} className="mb-4" />

          {open && isRecipient && (
            <Notice tone={hasRecalled ? "red" : "blue"} title={hasRecalled ? "Contains a recalled batch" : "Check before receiving"} className="mb-6">
              {hasRecalled
                ? "You can still receive it to quarantine the packs, or reject it so they go back to the sender."
                : "Confirm the boxes are sealed and the batch numbers match. Receiving moves custody of every pack to you."}
            </Notice>
          )}
          {s.status === "rejected" && s.rejection_reason && (
            <Notice tone="red" title="Rejected by the recipient" className="mb-6">
              {s.rejection_reason}
            </Notice>
          )}

          <Card className="mb-6 p-5">
            <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
              {[s.from, s.to].map((p, i) => (
                <div key={p.id} className={i === 1 ? "sm:order-3 sm:text-right" : ""}>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{i === 0 ? "From" : "To"}</p>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-sm text-slate-500">
                    {capitalize(p.type)} · {p.city}
                  </p>
                </div>
              ))}
              <ArrowRight className="mx-auto hidden size-6 text-slate-300 sm:order-2 sm:block" />
            </div>
            {s.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{s.notes}</p>}
          </Card>

          <Card>
            <CardHeader title="Contents" description={`${formatNumber(s.total_units)} packs`} />
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Batch</Th>
                  <Th>Expires</Th>
                  <Th className="text-right">Packs</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s.lines?.map((l) => (
                  <tr key={l.batch_id}>
                    <Td className="font-medium text-slate-900">
                      {l.product_name} {l.strength} <span className="font-normal text-slate-500">· {l.dosage_form}</span>
                    </Td>
                    <Td>
                      {l.batch_number} {l.recalled && <Badge tone="red">Recalled</Badge>}
                    </Td>
                    <Td>{formatDate(l.expires_on)}</Td>
                    <Td className="text-right tabular-nums">{formatNumber(l.quantity)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Modal
            open={rejectOpen}
            onClose={() => setRejectOpen(false)}
            title="Reject this shipment?"
            footer={
              <>
                <Button variant="secondary" onClick={() => setRejectOpen(false)}>Cancel</Button>
                <Button variant="danger" loading={act.isPending} onClick={() => act.mutate("reject")}>Reject shipment</Button>
              </>
            }
          >
            <div className="space-y-3 text-sm text-slate-600">
              <p>The packs return to {s.from.name}&apos;s stock and they&apos;ll be notified with your reason.</p>
              <Textarea
                label="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                error={fieldErrors(act.error).reason}
                placeholder="e.g. Seals broken on 3 cartons; quantity doesn't match invoice"
              />
            </div>
          </Modal>
        </>
      )}
    </RoleGate>
  );
}
