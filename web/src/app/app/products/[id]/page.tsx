"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Pencil, Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ProductForm, type ProductInput } from "@/components/product-form";
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
} from "@/components/ui";
import { api, type Batch, type Page, type Product } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { useMe } from "@/lib/session";
import Link from "next/link";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const isAdmin = me?.user.role === "admin";
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [statusModal, setStatusModal] = useState<null | "suspended" | "active" | "discontinued">(null);
  const [reason, setReason] = useState("");

  const product = useQuery({ queryKey: ["products", id], queryFn: () => api.get<Product>(`/products/${id}`) });
  const batches = useQuery({
    queryKey: ["batches", { product_id: id }],
    queryFn: () => api.get<Page<Batch>>("/batches", { product_id: id, limit: 100 }),
  });
  const update = useMutation({
    mutationFn: (input: ProductInput) => api.put<Product>(`/products/${id}`, input),
    onSuccess: (p) => {
      qc.setQueryData(["products", id], p);
      qc.invalidateQueries({ queryKey: ["products"] });
      setEditing(false);
      toast.success("Product updated");
    },
  });
  const setStatus = useMutation({
    mutationFn: (status: string) => api.post<Product>(`/products/${id}/status`, { status, reason }),
    onSuccess: (p) => {
      qc.setQueryData(["products", id], p);
      qc.invalidateQueries({ queryKey: ["products"] });
      setStatusModal(null);
      setReason("");
      toast.success(`Product is now ${p.status}`);
    },
  });

  const p = product.data;
  return (
    <RoleGate roles={["manufacturer", "admin"]}>
      {product.isPending ? (
        <Loading />
      ) : !p ? (
        <ErrorNotice error={product.error} />
      ) : (
        <>
          <PageHeader
            back={{ href: "/app/products", label: "Products" }}
            title={
              <span className="flex flex-wrap items-center gap-3">
                {p.name} {p.strength} <StatusBadge status={p.status} />
              </span>
            }
            description={`${p.generic_name} · ${p.dosage_form}${p.pack_size ? ` · ${p.pack_size}` : ""}${isAdmin ? ` · ${p.manufacturer_name}` : ""}`}
            actions={
              isAdmin ? (
                p.status === "suspended" ? (
                  <Button variant="secondary" onClick={() => setStatusModal("active")}>Lift suspension</Button>
                ) : (
                  <Button variant="danger" onClick={() => setStatusModal("suspended")}>Suspend product</Button>
                )
              ) : (
                <>
                  {p.status === "active" && (
                    <Button variant="ghost" onClick={() => setStatusModal("discontinued")}>Discontinue</Button>
                  )}
                  {p.status === "discontinued" && (
                    <Button variant="secondary" onClick={() => setStatusModal("active")}>Reactivate</Button>
                  )}
                  <Button variant="secondary" onClick={() => setEditing((e) => !e)}>
                    <Pencil className="size-4" /> {editing ? "Cancel edit" : "Edit"}
                  </Button>
                  {p.status === "active" && (
                    <ButtonLink href={`/app/batches/new?product=${p.id}`}><Plus className="size-4" /> New batch</ButtonLink>
                  )}
                </>
              )
            }
          />

          {p.status === "suspended" && (
            <Notice tone="red" title="Suspended by an administrator" className="mb-6">
              {p.status_reason || "No new batches can be created, and public checks show a warning."}
            </Notice>
          )}

          {editing ? (
            <Card className="mb-6 max-w-3xl p-6">
              <ProductForm initial={p} onSubmit={(i) => update.mutate(i)} submitting={update.isPending} error={update.error} submitLabel="Save changes" />
            </Card>
          ) : (
            p.description && (
              <Card className="mb-6 p-5">
                <p className="whitespace-pre-line text-sm text-slate-700">{p.description}</p>
              </Card>
            )
          )}

          <Card>
            <CardHeader title="Batches" description={`${formatNumber(p.batch_count)} batches · ${formatNumber(p.unit_count)} packs`} />
            {batches.isPending ? (
              <Loading />
            ) : !batches.data?.items.length ? (
              <EmptyState icon={<Boxes className="size-6" />} title="No batches yet" body="Create a batch to print unique QR labels for its packs." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Batch</Th>
                    <Th>Manufactured</Th>
                    <Th>Expires</Th>
                    <Th className="text-right">Packs</Th>
                    <Th className="text-right">Dispensed</Th>
                    <Th>State</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.data.items.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <Td>
                        <Link href={`/app/batches/${b.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {b.batch_number}
                        </Link>
                      </Td>
                      <Td>{formatDate(b.manufactured_on)}</Td>
                      <Td>{formatDate(b.expires_on)}</Td>
                      <Td className="text-right tabular-nums">{formatNumber(b.quantity)}</Td>
                      <Td className="text-right tabular-nums">{formatNumber(b.distribution.dispensed)}</Td>
                      <Td>
                        <BatchStateBadge recalled={!!b.recalled_at} expiresOn={b.expires_on} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Modal
            open={statusModal !== null}
            onClose={() => setStatusModal(null)}
            title={
              statusModal === "suspended" ? "Suspend this product?" : statusModal === "discontinued" ? "Discontinue this product?" : "Reactivate this product?"
            }
            footer={
              <>
                <Button variant="secondary" onClick={() => setStatusModal(null)}>Cancel</Button>
                <Button
                  variant={statusModal === "suspended" ? "danger" : "primary"}
                  loading={setStatus.isPending}
                  onClick={() => statusModal && setStatus.mutate(statusModal)}
                >
                  Confirm
                </Button>
              </>
            }
          >
            <div className="space-y-3 text-sm text-slate-600">
              {statusModal === "suspended" && (
                <p>Public checks of this product will show a warning, and the manufacturer can&apos;t create new batches.</p>
              )}
              {statusModal === "discontinued" && <p>You won&apos;t be able to create new batches. Existing stock is unaffected.</p>}
              <Textarea
                label={statusModal === "suspended" ? "Reason (shared with the manufacturer)" : "Note (optional)"}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <ErrorNotice error={setStatus.error} />
            </div>
          </Modal>
        </>
      )}
    </RoleGate>
  );
}
