"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { StatusBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, ErrorNotice, Loading, Modal, PageHeader, Pagination, Select, Textarea, cn } from "@/components/ui";
import { api, type Page, type Report } from "@/lib/api";
import { formatDateTime, normalizeCode } from "@/lib/format";

export default function AdminReportsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("open");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Report | null>(null);
  const [form, setForm] = useState({ status: "open", admin_note: "" });

  const reports = useQuery({
    queryKey: ["admin", "reports", { status, offset }],
    queryFn: () => api.get<Page<Report>>("/admin/reports", { status, offset }),
    placeholderData: keepPreviousData,
  });
  const save = useMutation({
    mutationFn: () => api.put<Report>(`/admin/reports/${editing!.id}`, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setEditing(null);
      toast.success("Report updated; the reporter has been notified.");
    },
  });

  return (
    <RoleGate roles={["admin"]}>
      <PageHeader title="Counterfeit reports" description="Reports from patients and the public about suspicious medicines." />
      <div className="mb-4 flex flex-wrap rounded-lg bg-slate-100 p-1 text-sm font-medium w-fit">
        {[
          ["open", "Open"],
          ["investigating", "Investigating"],
          ["closed", "Closed"],
          ["", "All"],
        ].map(([v, label]) => (
          <button
            key={v}
            onClick={() => {
              setStatus(v);
              setOffset(0);
            }}
            className={cn("rounded-md px-3 py-1.5", status === v ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-800")}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorNotice error={reports.error} className="mb-4" />
      {reports.isPending ? (
        <Loading />
      ) : !reports.data?.items.length ? (
        <Card>
          <EmptyState icon={<ClipboardList className="size-6" />} title="No reports here" />
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.data.items.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{r.product_name || "Unnamed product"}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(r.created_at)} · {r.reporter_name || "Anonymous"}
                    {r.place && ` · ${r.place}`}
                    {r.contact && ` · ${r.contact}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditing(r);
                      setForm({ status: r.status === "open" ? "investigating" : r.status, admin_note: r.admin_note });
                    }}
                  >
                    Update
                  </Button>
                </div>
              </div>
              {r.code && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono">{r.code}</span>
                  {r.known_code ? <Badge tone="amber">Registered code</Badge> : <Badge tone="red">Unknown code</Badge>}
                  {r.known_code && (
                    <Link href={`/v/${normalizeCode(r.code)}`} target="_blank" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                      View journey <ExternalLink className="size-3" />
                    </Link>
                  )}
                </div>
              )}
              <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{r.description}</p>
              {r.admin_note && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Note: {r.admin_note}</p>}
            </Card>
          ))}
          <Card>
            <Pagination page={reports.data} onChange={setOffset} />
          </Card>
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Update report"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="closed">Closed</option>
          </Select>
          <Textarea
            label="Note to reporter"
            value={form.admin_note}
            onChange={(e) => setForm({ ...form, admin_note: e.target.value })}
            hint="Signed-in reporters see this note and get a notification."
          />
          <ErrorNotice error={save.error} />
        </div>
      </Modal>
    </RoleGate>
  );
}
