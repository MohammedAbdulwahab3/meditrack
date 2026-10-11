"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Search, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, EmptyState, ErrorNotice, Input, Loading, PageHeader, Select, Textarea, cn, fieldErrors } from "@/components/ui";
import { api, type DirectoryEntry, type Inventory, type Shipment } from "@/lib/api";
import { capitalize, formatDate, formatNumber } from "@/lib/format";

type Line = { batch_id: string; quantity: string };

function NewShipmentForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [to, setTo] = useState<DirectoryEntry | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ batch_id: params.get("batch") ?? "", quantity: "" }]);

  const directory = useQuery({
    queryKey: ["directory", search],
    queryFn: () => api.get<DirectoryEntry[]>("/directory", { q: search }),
  });
  const inv = useQuery({ queryKey: ["inventory"], queryFn: () => api.get<Inventory>("/inventory") });

  // Only stock that can legally move: in stock, not recalled, not expired.
  const shippable = useMemo(
    () =>
      (inv.data?.products ?? []).flatMap((p) =>
        p.batches
          .filter((b) => b.in_stock > 0 && !b.recalled && !b.expired)
          .map((b) => ({ ...b, label: `${p.name} ${p.strength} · ${b.batch_number} · exp ${formatDate(b.expires_on)}` })),
      ),
    [inv.data],
  );
  const available = (batchId: string) => shippable.find((b) => b.batch_id === batchId)?.in_stock ?? 0;

  const create = useMutation({
    mutationFn: () =>
      api.post<Shipment>("/shipments", {
        to_org_id: to?.id ?? "",
        notes,
        lines: lines.filter((l) => l.batch_id).map((l) => ({ batch_id: l.batch_id, quantity: Number(l.quantity) })),
      }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      toast.success(`Shipment ${s.reference} sent to ${s.to.name}`);
      router.push(`/app/shipments/${s.id}`);
    },
  });
  const errs = fieldErrors(create.error);
  const total = lines.reduce((n, l) => n + (Number(l.quantity) || 0), 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
      className="grid gap-6 lg:grid-cols-5"
    >
      <Card className="lg:col-span-2">
        <CardHeader title="1. Recipient" description="Only approved partners you're allowed to supply are listed." />
        <div className="space-y-3 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or city" className="pl-9" aria-label="Search partners" />
          </div>
          {directory.isPending ? (
            <Loading />
          ) : !directory.data?.length ? (
            <EmptyState icon={<Building2 className="size-6" />} title="No partners found" />
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {directory.data.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setTo(d)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left ring-1 transition",
                      to?.id === d.id ? "bg-brand-50 ring-2 ring-brand-600" : "ring-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <p className="text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-slate-500">
                      {capitalize(d.type)} · {d.city}, {d.country}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {errs.to_org_id && <p className="text-xs text-rose-600">{errs.to_org_id}</p>}
        </div>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader title="2. Packs" description="Packs are picked from your stock in serial order and locked until received." />
        <div className="space-y-4 p-4">
          {inv.isPending ? (
            <Loading />
          ) : shippable.length === 0 ? (
            <EmptyState title="Nothing to ship" body="You have no stock that is in date and not recalled." />
          ) : (
            lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2">
                <div className="min-w-60 flex-1">
                  <Select
                    value={l.batch_id}
                    onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, batch_id: e.target.value } : x)))}
                    error={errs[`lines.${i}.batch_id`]}
                    aria-label="Batch"
                  >
                    <option value="">Choose a batch…</option>
                    {shippable.map((b) => (
                      <option key={b.batch_id} value={b.batch_id} disabled={lines.some((x, j) => j !== i && x.batch_id === b.batch_id)}>
                        {b.label} ({formatNumber(b.in_stock)} available)
                      </option>
                    ))}
                  </Select>
                  {errs[`lines.${i}.batch_id`] && <p className="mt-1 text-xs text-rose-600">{errs[`lines.${i}.batch_id`]}</p>}
                </div>
                <div className="w-32">
                  <Input
                    type="number"
                    min={1}
                    max={available(l.batch_id) || undefined}
                    value={l.quantity}
                    placeholder="Qty"
                    onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                    error={errs[`lines.${i}.quantity`]}
                    aria-label="Quantity"
                  />
                  {errs[`lines.${i}.quantity`] && <p className="mt-1 text-xs text-rose-600">{errs[`lines.${i}.quantity`]}</p>}
                </div>
                {lines.length > 1 && (
                  <Button type="button" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove line">
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))
          )}
          {shippable.length > lines.length && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, { batch_id: "", quantity: "" }])}>
              <Plus className="size-4" /> Add batch
            </Button>
          )}
          <Textarea label="Notes for the recipient (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Invoice number, delivery vehicle, cold-chain notes…" />
          {errs.lines && <p className="text-xs text-rose-600">{errs.lines}</p>}
          {create.error && Object.keys(errs).length === 0 && <ErrorNotice error={create.error} />}
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-500">
              {to ? (
                <>
                  Sending <span className="font-semibold text-slate-900">{formatNumber(total)}</span> packs to{" "}
                  <span className="font-semibold text-slate-900">{to.name}</span>
                </>
              ) : (
                "Choose a recipient"
              )}
            </p>
            <Button type="submit" loading={create.isPending} disabled={!to || total === 0}>
              Send shipment
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

export default function NewShipmentPage() {
  return (
    <RoleGate roles={["manufacturer", "importer", "pharmacy"]}>
      <PageHeader title="New shipment" description="Transfer custody of packs to a partner." back={{ href: "/app/shipments", label: "Shipments" }} />
      <Suspense>
        <NewShipmentForm />
      </Suspense>
    </RoleGate>
  );
}
