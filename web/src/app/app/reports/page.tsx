"use client";

import { useQuery } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { StatusBadge } from "@/components/status";
import { ButtonLink, Card, EmptyState, ErrorNotice, Loading, PageHeader } from "@/components/ui";
import { api, type Report } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export default function MyReportsPage() {
  const reports = useQuery({ queryKey: ["me", "reports"], queryFn: () => api.get<Report[]>("/me/reports") });
  return (
    <>
      <PageHeader
        title="My reports"
        description="Suspicious medicines you reported, and what our team found."
        actions={<ButtonLink href="/report" variant="danger"><Flag className="size-4" /> New report</ButtonLink>}
      />
      <ErrorNotice error={reports.error} className="mb-4" />
      {reports.isPending ? (
        <Loading />
      ) : !reports.data?.length ? (
        <Card>
          <EmptyState icon={<Flag className="size-6" />} title="No reports" body="If a medicine looks wrong, report it — it helps protect everyone." />
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.data.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{r.product_name || "Unnamed product"}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(r.created_at)}
                    {r.place && ` · ${r.place}`}
                    {r.code && <span className="font-mono"> · {r.code}</span>}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{r.description}</p>
              {r.admin_note && (
                <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  <span className="font-semibold">MediTrack team:</span> {r.admin_note}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
