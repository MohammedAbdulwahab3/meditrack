"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { StatusBadge } from "@/components/status";
import { ButtonLink, Card, EmptyState, ErrorNotice, Loading, PageHeader, Pagination, Select, Table, Td, Th, cn } from "@/components/ui";
import { api, type Page, type Shipment } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { isActiveOrg, useMe } from "@/lib/session";

export default function ShipmentsPage() {
  const { data: me } = useMe();
  const isAdmin = me?.user.role === "admin";
  const myOrg = me?.organization?.id;
  const [direction, setDirection] = useState<"" | "in" | "out">("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const shipments = useQuery({
    queryKey: ["shipments", { direction, status, offset }],
    queryFn: () => api.get<Page<Shipment>>("/shipments", { direction, status, offset }),
    placeholderData: keepPreviousData,
  });

  return (
    <RoleGate roles={["manufacturer", "importer", "pharmacy", "admin"]}>
      <PageHeader
        title="Shipments"
        description={isAdmin ? "All custody transfers on the platform." : "Stock you've sent and stock on its way to you."}
        actions={isActiveOrg(me) && <ButtonLink href="/app/shipments/new"><Plus className="size-4" /> New shipment</ButtonLink>}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          {!isAdmin && (
            <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
              {(
                [
                  ["", "All"],
                  ["in", "Incoming"],
                  ["out", "Outgoing"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => {
                    setDirection(v);
                    setOffset(0);
                  }}
                  className={cn("rounded-md px-3 py-1.5", direction === v ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-800")}
                >
                  {label}
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
            className="w-44"
            aria-label="Status"
          >
            <option value="">Any status</option>
            <option value="in_transit">In transit</option>
            <option value="received">Received</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <ErrorNotice error={shipments.error} className="m-4" />
        {shipments.isPending ? (
          <Loading />
        ) : !shipments.data?.items.length ? (
          <EmptyState icon={<Truck className="size-6" />} title="No shipments" body="Shipments you send or receive will be listed here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                {!isAdmin && <Th>Direction</Th>}
                <Th>From</Th>
                <Th>To</Th>
                <Th className="text-right">Packs</Th>
                <Th>Sent</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shipments.data.items.map((s) => {
                const incoming = s.to.id === myOrg;
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/app/shipments/${s.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {s.reference}
                      </Link>
                    </Td>
                    {!isAdmin && (
                      <Td>
                        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", incoming ? "text-sky-700" : "text-slate-500")}>
                          {incoming ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                          {incoming ? "Incoming" : "Outgoing"}
                        </span>
                      </Td>
                    )}
                    <Td>{s.from.name}</Td>
                    <Td>{s.to.name}</Td>
                    <Td className="text-right tabular-nums">{formatNumber(s.total_units)}</Td>
                    <Td>{formatDateTime(s.created_at)}</Td>
                    <Td>
                      <StatusBadge status={s.status} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={shipments.data} onChange={setOffset} />
      </Card>
    </RoleGate>
  );
}
