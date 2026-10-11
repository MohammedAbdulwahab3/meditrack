"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { History, ScanLine } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "@/components/status";
import { ButtonLink, Card, EmptyState, ErrorNotice, Loading, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";
import { api, type MyScan, type Page } from "@/lib/api";
import { formatDateTime, normalizeCode } from "@/lib/format";

export default function ScansPage() {
  const [offset, setOffset] = useState(0);
  const scans = useQuery({
    queryKey: ["me", "scans", offset],
    queryFn: () => api.get<Page<MyScan>>("/me/scans", { offset }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Scan history"
        description="Medicines you checked while signed in."
        actions={<ButtonLink href="/verify"><ScanLine className="size-4" /> Check a medicine</ButtonLink>}
      />
      <Card>
        <ErrorNotice error={scans.error} className="m-4" />
        {scans.isPending ? (
          <Loading />
        ) : !scans.data?.items.length ? (
          <EmptyState icon={<History className="size-6" />} title="No checks yet" body="Scan a pack's QR code to see if it's genuine." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Medicine</Th>
                <Th>Code</Th>
                <Th>Checked</Th>
                <Th>Result</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scans.data.items.map((s, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/v/${normalizeCode(s.code)}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {s.product_name || "Unknown product"}
                    </Link>
                    {s.batch_number && <p className="text-xs text-slate-500">Batch {s.batch_number}</p>}
                  </Td>
                  <Td className="font-mono">{s.code}</Td>
                  <Td>{formatDateTime(s.checked_at)}</Td>
                  <Td>
                    <StatusBadge status={s.result} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={scans.data} onChange={setOffset} />
      </Card>
    </>
  );
}
