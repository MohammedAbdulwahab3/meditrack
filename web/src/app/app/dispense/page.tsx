"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Keyboard, ShoppingBag, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { Scanner } from "@/components/scanner";
import { useToast } from "@/components/toast";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Input,
  Loading,
  PageHeader,
  Pagination,
  Select,
  Table,
  Td,
  Th,
  cn,
  fieldErrors,
} from "@/components/ui";
import { api, type DispenseResult, type DispensedUnit, type Inventory, type Page } from "@/lib/api";
import { formatCode, formatDateTime, formatNumber, normalizeCode } from "@/lib/format";

type Mode = "scan" | "quantity";

export default function DispensePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("scan");
  const [basket, setBasket] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [results, setResults] = useState<DispenseResult[] | null>(null);
  const [offset, setOffset] = useState(0);

  const inv = useQuery({ queryKey: ["inventory"], queryFn: () => api.get<Inventory>("/inventory"), enabled: mode === "quantity" });
  const recent = useQuery({
    queryKey: ["dispensed", offset],
    queryFn: () => api.get<Page<DispensedUnit>>("/dispense", { offset, limit: 10 }),
    placeholderData: keepPreviousData,
  });

  const addCode = (raw: string) => {
    const c = normalizeCode(raw);
    if (c.length !== 12) {
      toast.error("That isn't a MediTrack pack code.");
      return;
    }
    setResults(null);
    setBasket((b) => (b.includes(c) ? b : [...b, c]));
  };

  const dispense = useMutation({
    mutationFn: () =>
      api.post<{ dispensed: number; results: DispenseResult[] }>(
        "/dispense",
        mode === "scan" ? { codes: basket } : { product_id: productId, quantity: Number(qty) },
      ),
    onSuccess: (out) => {
      setResults(out.results);
      if (mode === "scan") setBasket([]);
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["dispensed"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      if (out.dispensed > 0) toast.success(`${out.dispensed} pack(s) dispensed`);
    },
  });
  const errs = fieldErrors(dispense.error);
  const sellable = (inv.data?.products ?? []).filter((p) => p.sellable > 0);

  return (
    <RoleGate roles={["pharmacy"]}>
      <PageHeader
        title="Dispense"
        description="Record packs sold to patients. Recalled, expired, already-sold and unknown packs are blocked automatically."
      />
      <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {(
          [
            ["scan", "Scan packs"],
            ["quantity", "By quantity"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setResults(null);
              dispense.reset();
            }}
            className={cn("rounded-md px-4 py-1.5", mode === m ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-800")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {mode === "scan" ? (
          <>
            <Card className="p-4">
              <Scanner onScan={addCode} />
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addCode(typed);
                  setTyped("");
                }}
              >
                <div className="relative flex-1">
                  <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type or use a barcode reader" className="pl-9 font-mono uppercase" aria-label="Pack code" />
                </div>
                <Button type="submit" variant="secondary">Add</Button>
              </form>
            </Card>
            <Card>
              <CardHeader title="Basket" description={`${basket.length} pack(s)`} />
              {basket.length === 0 ? (
                <EmptyState icon={<ShoppingBag className="size-6" />} title="Scan packs to add them" body="Each pack's own QR code is checked when you dispense." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {basket.map((c) => (
                    <li key={c} className="flex items-center justify-between px-5 py-2.5">
                      <span className="font-mono text-sm">{formatCode(c)}</span>
                      <button onClick={() => setBasket((b) => b.filter((x) => x !== c))} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Remove">
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
                {basket.length > 0 && <Button variant="ghost" onClick={() => setBasket([])}>Clear</Button>}
                <Button disabled={basket.length === 0} loading={dispense.isPending} onClick={() => dispense.mutate()}>
                  Dispense {basket.length || ""} pack(s)
                </Button>
              </div>
            </Card>
          </>
        ) : (
          <Card className="p-5 lg:col-span-1">
            {inv.isPending ? (
              <Loading />
            ) : sellable.length === 0 ? (
              <EmptyState title="No sellable stock" body="Receive a shipment to start dispensing." />
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  dispense.mutate();
                }}
              >
                <Select label="Product" value={productId} onChange={(e) => setProductId(e.target.value)} error={errs.product_id} required>
                  <option value="">Choose…</option>
                  {sellable.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.name} {p.strength} — {formatNumber(p.sellable)} sellable
                    </option>
                  ))}
                </Select>
                <Input label="Packs" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} error={errs.quantity} required />
                <p className="text-xs text-slate-500">Packs from the batch that expires first are dispensed first.</p>
                <Button type="submit" loading={dispense.isPending} className="w-full">
                  Dispense
                </Button>
              </form>
            )}
          </Card>
        )}
      </div>

      {dispense.error && Object.keys(errs).length === 0 && <ErrorNotice error={dispense.error} className="mt-4" />}
      {results && results.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Result" />
          <ul className="divide-y divide-slate-100">
            {results.map((r) => (
              <li key={r.code} className="flex items-start gap-3 px-5 py-3">
                {r.ok ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /> : <XCircle className="mt-0.5 size-5 text-rose-600" />}
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-mono">{r.code}</span>
                    {r.product_name && <span className="text-slate-500"> · {r.product_name} · {r.batch_number}</span>}
                  </p>
                  <p className={cn("text-sm", r.ok ? "text-slate-500" : "font-medium text-rose-700")}>{r.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Recently dispensed" />
        {recent.isPending ? (
          <Loading />
        ) : !recent.data?.items.length ? (
          <EmptyState title="Nothing dispensed yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pack code</Th>
                <Th>Product</Th>
                <Th>Batch</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.data.items.map((d) => (
                <tr key={d.code}>
                  <Td className="font-mono">{d.code}</Td>
                  <Td>{d.product_name}</Td>
                  <Td>{d.batch_number}</Td>
                  <Td>{formatDateTime(d.dispensed_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={recent.data} onChange={setOffset} />
      </Card>
    </RoleGate>
  );
}
