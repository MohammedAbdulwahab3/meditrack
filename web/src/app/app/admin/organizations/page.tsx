"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { StatusBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, ErrorNotice, Input, Loading, Modal, PageHeader, Pagination, Select, Table, Td, Textarea, Th, cn, fieldErrors } from "@/components/ui";
import { api, type AdminOrg, type Page } from "@/lib/api";
import { capitalize, formatDate, timeAgo } from "@/lib/format";

type Action = { org: AdminOrg; to: "active" | "rejected" | "suspended" };

const actionCopy: Record<Action["to"], { title: string; button: string; danger: boolean; body: string }> = {
  active: { title: "Approve", button: "Approve", danger: false, body: "They can start registering and moving medicines immediately, with a 30-day free trial." },
  rejected: { title: "Reject", button: "Reject", danger: true, body: "They'll be told why. You can approve them later if they resolve the issue." },
  suspended: { title: "Suspend", button: "Suspend", danger: true, body: "Members can still sign in but can't ship, receive or dispense until reactivated." },
};

function OrganizationsView() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");

  const orgs = useQuery({
    queryKey: ["admin", "orgs", { status, type, q, offset }],
    queryFn: () => api.get<Page<AdminOrg>>("/admin/organizations", { status, type, q, offset }),
    placeholderData: keepPreviousData,
  });
  const change = useMutation({
    mutationFn: () => api.post(`/admin/organizations/${action!.org.id}/status`, { status: action!.to, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(`${action!.org.name} is now ${action!.to}`);
      setAction(null);
      setReason("");
    },
  });

  const tabs = [
    ["", "All"],
    ["pending", "Pending"],
    ["active", "Active"],
    ["suspended", "Suspended"],
    ["rejected", "Rejected"],
  ];

  return (
    <>
      <PageHeader title="Organizations" description="Approve licensed businesses before they can join the supply chain." />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="flex flex-wrap rounded-lg bg-slate-100 p-1 text-sm font-medium">
            {tabs.map(([v, label]) => (
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
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-40" aria-label="Type">
            <option value="">All types</option>
            <option value="manufacturer">Manufacturers</option>
            <option value="importer">Importers</option>
            <option value="pharmacy">Pharmacies</option>
          </Select>
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, license or city" className="pl-9" aria-label="Search" />
          </div>
        </div>
        <ErrorNotice error={orgs.error} className="m-4" />
        {orgs.isPending ? (
          <Loading />
        ) : !orgs.data?.items.length ? (
          <EmptyState icon={<Building2 className="size-6" />} title="No organizations" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Organization</Th>
                <Th>Type</Th>
                <Th>Contact</Th>
                <Th>Registered</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgs.data.items.map((o) => (
                <tr key={o.id} className="align-top">
                  <Td>
                    <p className="font-medium text-slate-900">{o.name}</p>
                    <p className="text-xs text-slate-500">
                      {o.city}, {o.country} · License <span className="font-mono">{o.license_number}</span>
                    </p>
                  </Td>
                  <Td><StatusBadge status={o.type} /></Td>
                  <Td className="text-xs">
                    <p>{o.email || "—"}</p>
                    <p className="text-slate-500">{o.phone}</p>
                  </Td>
                  <Td className="text-xs">
                    <span title={formatDate(o.created_at)}>{timeAgo(o.created_at)}</span>
                  </Td>
                  <Td>
                    <StatusBadge status={o.status} />
                    {o.status_reason && <p className="mt-1 max-w-48 truncate text-xs text-slate-500" title={o.status_reason}>{o.status_reason}</p>}
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {o.status === "pending" && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => setAction({ org: o, to: "rejected" })}>Reject</Button>
                          <Button size="sm" onClick={() => setAction({ org: o, to: "active" })}>Approve</Button>
                        </>
                      )}
                      {o.status === "active" && (
                        <Button size="sm" variant="secondary" onClick={() => setAction({ org: o, to: "suspended" })}>Suspend</Button>
                      )}
                      {(o.status === "suspended" || o.status === "rejected") && (
                        <Button size="sm" variant="secondary" onClick={() => setAction({ org: o, to: "active" })}>
                          {o.status === "suspended" ? "Reactivate" : "Approve"}
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={orgs.data} onChange={setOffset} />
      </Card>

      {action && (
        <Modal
          open
          onClose={() => setAction(null)}
          title={`${actionCopy[action.to].title} ${action.org.name}?`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
              <Button variant={actionCopy[action.to].danger ? "danger" : "primary"} loading={change.isPending} onClick={() => change.mutate()}>
                {actionCopy[action.to].button}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-slate-600">
            <p>{actionCopy[action.to].body}</p>
            <p className="rounded-lg bg-slate-50 p-3 text-xs">
              {capitalize(action.org.type)} · License <span className="font-mono">{action.org.license_number}</span> · {action.org.city}, {action.org.country}
            </p>
            {action.to !== "active" && (
              <Textarea label="Reason (shown to the organization)" value={reason} onChange={(e) => setReason(e.target.value)} error={fieldErrors(change.error).reason} />
            )}
            {change.error && !fieldErrors(change.error).reason && <ErrorNotice error={change.error} />}
          </div>
        </Modal>
      )}
    </>
  );
}

export default function AdminOrganizationsPage() {
  return (
    <RoleGate roles={["admin"]}>
      <Suspense>
        <OrganizationsView />
      </Suspense>
    </RoleGate>
  );
}
