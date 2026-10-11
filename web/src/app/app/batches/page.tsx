"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Boxes, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { BatchStateBadge } from "@/components/status";
import { ButtonLink, Card, EmptyState, ErrorNotice, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th } from "@/components/ui";
import { api, type Batch, type Page } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { useMe } from "@/lib/session";

function DistributionBar({ b }: { b: Batch }) {
  const d = b.distribution;
  const parts = [
    { n: d.with_manufacturer, cls: "bg-slate-300", label: "With manufacturer" },
    { n: d.in_transit, cls: "bg-sky-400", label: "In transit" },
    { n: d.with_partners, cls: "bg-brand-400", label: "With partners" },
    { n: d.dispensed, cls: "bg-brand-700", label: "Dispensed" },
  ];
  return (
    <div className="flex h-2 w-32 gap-[2px] overflow-hidden rounded-full bg-slate-100" title={parts.map((p) => `${p.label}: ${p.n}`).join(" · ")}>
      {parts.map((p) => (p.n > 0 ? <div key={p.label} className={p.cls} style={{ width: `${(p.n / b.quantity) * 100}%` }} /> : null))}
    </div>
  );
}

function BatchesList() {
  const params = useSearchParams();
  const { data: me } = useMe();
  const isAdmin = me?.user.role === "admin";
  const [q, setQ] = useState("");
  const [state, setState] = useState(params.get("state") ?? "");
  const [offset, setOffset] = useState(0);
  const batches = useQuery({
    queryKey: ["batches", { q, state, offset }],
    queryFn: () => api.get<Page<Batch>>("/batches", { q, state, offset }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={isAdmin ? "Batches & recalls" : "Batches & labels"}
        description={
          isAdmin
            ? "Every production batch on the platform. Open a batch to see where its packs are or to recall it."
            : "Each batch mints one unique code per pack. Print the labels, then ship."
        }
        actions={!isAdmin && <ButtonLink href="/app/batches/new"><Plus className="size-4" /> New batch</ButtonLink>}
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
              placeholder="Search batch number or product"
              className="pl-9"
              aria-label="Search batches"
            />
          </div>
          <Select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setOffset(0);
            }}
            className="w-44"
            aria-label="State"
          >
            <option value="">All batches</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="recalled">Recalled</option>
          </Select>
        </div>
        <ErrorNotice error={batches.error} className="m-4" />
        {batches.isPending ? (
          <Loading />
        ) : !batches.data?.items.length ? (
          <EmptyState
            icon={<Boxes className="size-6" />}
            title={q || state ? "No matching batches" : "No batches yet"}
            action={!isAdmin && !q && !state && <ButtonLink href="/app/batches/new">Create a batch</ButtonLink>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Batch</Th>
                <Th>Product</Th>
                {isAdmin && <Th>Manufacturer</Th>}
                <Th>Expires</Th>
                <Th className="text-right">Packs</Th>
                <Th>Distribution</Th>
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
                  <Td>
                    {b.product.name} {b.product.strength}
                  </Td>
                  {isAdmin && <Td>{b.manufacturer_name}</Td>}
                  <Td>{formatDate(b.expires_on)}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(b.quantity)}</Td>
                  <Td>
                    <DistributionBar b={b} />
                  </Td>
                  <Td>
                    <BatchStateBadge recalled={!!b.recalled_at} expiresOn={b.expires_on} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={batches.data} onChange={setOffset} />
      </Card>
    </>
  );
}

export default function BatchesPage() {
  return (
    <RoleGate roles={["manufacturer", "admin"]}>
      <Suspense>
        <BatchesList />
      </Suspense>
    </RoleGate>
  );
}
