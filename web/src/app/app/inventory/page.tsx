"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Package, SlidersHorizontal, Truck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { BatchStateBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorNotice, Input, Loading, Modal, PageHeader, Table, Td, Th, cn, fieldErrors } from "@/components/ui";
import { api, type Inventory, type StockProduct } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { isActiveOrg, useMe } from "@/lib/session";

type Filter = "all" | "low" | "expiring" | "expired" | "recalled";

function matches(p: StockProduct, f: Filter) {
  const has = (pred: (b: StockProduct["batches"][number]) => boolean) => p.batches.some((b) => b.in_stock > 0 && pred(b));
  switch (f) {
    case "low":
      return p.low_stock;
    case "expiring":
      return has((b) => b.expiring_soon && !b.recalled);
    case "expired":
      return has((b) => b.expired && !b.recalled);
    case "recalled":
      return has((b) => b.recalled);
    default:
      return true;
  }
}

function InventoryView() {
  const params = useSearchParams();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const initial = (params.get("filter") ?? (params.get("recalled") ? "recalled" : "all")) as Filter;
  const [filter, setFilter] = useState<Filter>(initial);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<StockProduct | null>(null);
  const [min, setMin] = useState("");

  const inv = useQuery({ queryKey: ["inventory"], queryFn: () => api.get<Inventory>("/inventory") });
  const saveThreshold = useMutation({
    mutationFn: () => api.put(`/inventory/thresholds/${editing!.product_id}`, { min_quantity: min === "" ? null : Number(min) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      setEditing(null);
      toast.success("Reorder level saved");
    },
  });

  const s = inv.data?.summary;
  const chips: { key: Filter; label: string; n?: number; tone?: string }[] = [
    { key: "all", label: "All", n: s?.products },
    { key: "low", label: "Low stock", n: s?.low_stock },
    { key: "expiring", label: "Expiring ≤ 90 days", n: s?.expiring_soon },
    { key: "expired", label: "Expired", n: s?.expired },
    { key: "recalled", label: "Recalled", n: s?.recalled },
  ];
  const rows = (inv.data?.products ?? []).filter((p) => matches(p, filter));

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Every pack your organization holds, by product and batch."
        actions={
          isActiveOrg(me) && (
            <ButtonLink href="/app/shipments/new" variant="secondary">
              <Truck className="size-4" /> Ship stock
            </ButtonLink>
          )
        }
      />
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Packs in stock", s.total_units],
            ["Products", s.products],
            ["Shipping out", s.in_transit_out],
            ["Need attention", s.low_stock + s.expired + s.recalled],
          ].map(([k, v]) => (
            <Card key={k as string} className="px-4 py-3">
              <p className="text-xs text-slate-500">{k}</p>
              <p className="text-xl font-bold tabular-nums">{formatNumber(v as number)}</p>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition",
                filter === c.key ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300",
              )}
            >
              {c.label}
              {c.n != null && c.key !== "all" && c.n > 0 && <span className="ml-1.5 tabular-nums opacity-80">{formatNumber(c.n)}</span>}
            </button>
          ))}
        </div>
        <ErrorNotice error={inv.error} className="m-4" />
        {inv.isPending ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Package className="size-6" />}
            title={filter === "all" ? "No stock yet" : "Nothing here"}
            body={filter === "all" ? "Stock appears when you receive a shipment (or create a batch, for manufacturers)." : "No products match this filter."}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-8" />
                <Th>Product</Th>
                <Th>Manufacturer</Th>
                <Th className="text-right">In stock</Th>
                <Th className="text-right">Sellable</Th>
                <Th className="text-right">Reorder level</Th>
                <Th>Flags</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => {
                const expanded = open[p.product_id] ?? filter !== "all";
                const recalled = p.batches.some((b) => b.recalled && b.in_stock > 0);
                const expired = p.batches.some((b) => b.expired && !b.recalled && b.in_stock > 0);
                const expiring = p.batches.some((b) => b.expiring_soon && !b.recalled && b.in_stock > 0);
                return (
                  <Fragment key={p.product_id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen((o) => ({ ...o, [p.product_id]: !expanded }))}>
                      <Td>
                        <ChevronDown className={cn("size-4 text-slate-400 transition", !expanded && "-rotate-90")} />
                      </Td>
                      <Td>
                        <p className="font-medium text-slate-900">
                          {p.name} {p.strength}
                        </p>
                        <p className="text-xs text-slate-500">{p.dosage_form} · {p.batches.length} batch(es)</p>
                      </Td>
                      <Td>{p.manufacturer_name}</Td>
                      <Td className="text-right tabular-nums">{formatNumber(p.in_stock)}</Td>
                      <Td className="text-right font-semibold tabular-nums">{formatNumber(p.sellable)}</Td>
                      <Td className="text-right">
                        <button
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(p);
                            setMin(p.min_quantity == null ? "" : String(p.min_quantity));
                          }}
                        >
                          {p.min_quantity == null ? "Set" : formatNumber(p.min_quantity)} <SlidersHorizontal className="size-3.5" />
                        </button>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {p.low_stock && <Badge tone="amber">Low stock</Badge>}
                          {recalled && <Badge tone="red">Recalled</Badge>}
                          {expired && <Badge tone="red">Expired</Badge>}
                          {expiring && <Badge tone="amber">Expiring</Badge>}
                        </div>
                      </Td>
                    </tr>
                    {expanded &&
                      p.batches.map((b) => (
                        <tr key={b.batch_id} className="bg-slate-50/60 text-xs">
                          <Td />
                          <Td className="pl-8">
                            Batch <span className="font-medium text-slate-900">{b.batch_number}</span>
                            {b.recalled && <p className="max-w-xs truncate text-rose-700" title={b.recall_reason}>{b.recall_reason}</p>}
                          </Td>
                          <Td>Expires {formatDate(b.expires_on)}</Td>
                          <Td className="text-right tabular-nums">{formatNumber(b.in_stock)}</Td>
                          <Td className="text-right tabular-nums text-slate-400">
                            {b.in_transit_out > 0 && `${formatNumber(b.in_transit_out)} shipping`}
                          </Td>
                          <Td />
                          <Td>
                            <BatchStateBadge recalled={b.recalled} expiresOn={b.expires_on} />
                          </Td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Reorder level · ${editing?.name ?? ""} ${editing?.strength ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={saveThreshold.isPending} onClick={() => saveThreshold.mutate()}>Save</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Alert me when sellable packs drop below"
            type="number"
            min={0}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            hint="Leave empty to turn off low-stock alerts for this product."
            error={fieldErrors(saveThreshold.error).min_quantity}
          />
          <ErrorNotice error={saveThreshold.error} />
        </div>
      </Modal>
    </>
  );
}

export default function InventoryPage() {
  return (
    <RoleGate roles={["manufacturer", "importer", "pharmacy"]}>
      <Suspense>
        <InventoryView />
      </Suspense>
    </RoleGate>
  );
}
