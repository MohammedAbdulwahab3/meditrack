"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText, Search } from "lucide-react";
import { useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { Card, EmptyState, ErrorNotice, Input, Loading, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";
import { api, type AuditEvent, type Page } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

function summarize(details: Record<string, unknown>) {
  return Object.entries(details)
    .filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default function AuditPage() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const events = useQuery({
    queryKey: ["admin", "audit", { q, offset }],
    queryFn: () => api.get<Page<AuditEvent>>("/admin/audit", { q, offset, limit: 50 }),
    placeholderData: keepPreviousData,
  });
  return (
    <RoleGate roles={["admin"]}>
      <PageHeader title="Audit log" description="Every significant action on the platform, newest first. Entries can't be edited." />
      <Card>
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
              placeholder="Action (e.g. batch.recalled), organization or email"
              className="pl-9"
              aria-label="Search audit log"
            />
          </div>
        </div>
        <ErrorNotice error={events.error} className="m-4" />
        {events.isPending ? (
          <Loading />
        ) : !events.data?.items.length ? (
          <EmptyState icon={<ScrollText className="size-6" />} title="No events" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Action</Th>
                <Th>Actor</Th>
                <Th>Organization</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.data.items.map((e) => (
                <tr key={e.id}>
                  <Td className="text-xs">{formatDateTime(e.created_at)}</Td>
                  <Td className="font-mono text-xs text-slate-900">{e.action}</Td>
                  <Td className="text-xs">{e.actor_email ?? "—"}</Td>
                  <Td className="text-xs">{e.organization_name ?? "—"}</Td>
                  <Td className="max-w-md truncate text-xs text-slate-500" >
                    <span title={summarize(e.details)}>{summarize(e.details) || "—"}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={events.data} onChange={setOffset} />
      </Card>
    </RoleGate>
  );
}
