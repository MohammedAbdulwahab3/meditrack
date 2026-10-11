"use client";

import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { Button, Card, ErrorNotice, Input, Loading, PageHeader } from "@/components/ui";
import { api, type BatchDetail, type Page, type UnitLabel } from "@/lib/api";
import { formatCode, formatDate, formatNumber } from "@/lib/format";

const MAX_PER_SHEET = 500;

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "");
}

export default function LabelsPage() {
  const { id } = useParams<{ id: string }>();
  const [from, setFrom] = useState(1);
  const [count, setCount] = useState(100);
  const batch = useQuery({ queryKey: ["batches", id], queryFn: () => api.get<BatchDetail>(`/batches/${id}`) });
  const labels = useQuery({
    queryKey: ["labels", id, from, count],
    queryFn: () => api.get<Page<UnitLabel>>(`/batches/${id}/labels`, { offset: Math.max(0, from - 1), limit: count }),
    enabled: count > 0 && count <= MAX_PER_SHEET,
  });
  const [svgs, setSvgs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!labels.data) return;
    let cancelled = false;
    const base = siteUrl();
    Promise.all(
      labels.data.items.map(async (l) => [l.code, await QRCode.toString(`${base}/v/${l.code}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" })] as const),
    ).then((pairs) => !cancelled && setSvgs(Object.fromEntries(pairs)));
    return () => {
      cancelled = true;
    };
  }, [labels.data]);

  const b = batch.data;
  return (
    <RoleGate roles={["manufacturer"]}>
      <div className="no-print">
        <PageHeader
          back={{ href: `/app/batches/${id}`, label: "Batch" }}
          title="Print QR labels"
          description={b ? `${b.product.name} ${b.product.strength} · Batch ${b.batch_number} · ${formatNumber(b.quantity)} packs` : undefined}
          actions={
            <Button onClick={() => window.print()} disabled={!labels.data}>
              <Printer className="size-4" /> Print
            </Button>
          }
        />
        <Card className="mb-6 flex flex-wrap items-end gap-4 p-4">
          <div className="w-36">
            <Input label="Start at pack #" type="number" min={1} max={b?.quantity} value={from} onChange={(e) => setFrom(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div className="w-36">
            <Input
              label="Labels on this sheet"
              type="number"
              min={1}
              max={MAX_PER_SHEET}
              value={count}
              onChange={(e) => setCount(Math.min(MAX_PER_SHEET, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
          <p className="pb-2 text-sm text-slate-500">
            Print in runs of up to {MAX_PER_SHEET}. Each label&apos;s QR opens the public verification page for that exact pack.
          </p>
        </Card>
        <ErrorNotice error={labels.error ?? batch.error} className="mb-4" />
      </div>

      {labels.isPending || !b ? (
        <Loading label="Preparing labels…" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
          {labels.data?.items.map((l) => (
            <div key={l.code} className="flex break-inside-avoid items-center gap-3 rounded-lg border border-slate-300 bg-white p-2.5">
              <div className="size-20 shrink-0 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs[l.code] ?? "" }} />
              <div className="min-w-0 text-[10px] leading-tight text-slate-800">
                <p className="truncate text-[11px] font-bold">
                  {b.product.name} {b.product.strength}
                </p>
                <p>Batch {b.batch_number}</p>
                <p>EXP {formatDate(b.expires_on)}</p>
                <p className="mt-1 font-mono text-[11px] font-semibold tracking-wide">{formatCode(l.code)}</p>
                <p className="text-slate-500">Scan to verify · #{l.serial}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </RoleGate>
  );
}
