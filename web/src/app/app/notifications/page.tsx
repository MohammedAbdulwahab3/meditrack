"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, Bell, Building2, CheckCheck, ClipboardCheck, ClipboardList, Package, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, EmptyState, ErrorNotice, Loading, PageHeader, Pagination, cn } from "@/components/ui";
import { api, type Notification, type Page } from "@/lib/api";
import { timeAgo } from "@/lib/format";

const icons: Record<string, { icon: React.ElementType; cls: string }> = {
  recall: { icon: Ban, cls: "bg-rose-50 text-rose-600" },
  suspicious_scans: { icon: AlertTriangle, cls: "bg-amber-50 text-amber-600" },
  low_stock: { icon: Package, cls: "bg-amber-50 text-amber-600" },
  report: { icon: ClipboardList, cls: "bg-rose-50 text-rose-600" },
  report_update: { icon: ClipboardList, cls: "bg-sky-50 text-sky-600" },
  organization_pending: { icon: Building2, cls: "bg-amber-50 text-amber-600" },
  organization_status: { icon: Building2, cls: "bg-brand-50 text-brand-700" },
};

export default function NotificationsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [unread, setUnread] = useState(false);
  const [offset, setOffset] = useState(0);
  const list = useQuery({
    queryKey: ["notifications", { unread, offset }],
    queryFn: () => api.get<Page<Notification>>("/notifications", { unread, offset }),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const readAll = useMutation({ mutationFn: () => api.post("/notifications/read-all"), onSuccess: refresh });
  const readOne = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: refresh });

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <>
            <Button variant="secondary" onClick={() => setUnread((u) => !u)}>
              {unread ? "Show all" : "Unread only"}
            </Button>
            <Button variant="secondary" loading={readAll.isPending} onClick={() => readAll.mutate()}>
              <CheckCheck className="size-4" /> Mark all read
            </Button>
          </>
        }
      />
      <Card>
        <ErrorNotice error={list.error} className="m-4" />
        {list.isPending ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <EmptyState icon={<Bell className="size-6" />} title={unread ? "You're all caught up" : "No notifications yet"} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.data.items.map((n) => {
              const look = icons[n.kind] ?? (n.kind.startsWith("order") ? { icon: ClipboardCheck, cls: "bg-brand-50 text-brand-700" } : n.kind.startsWith("shipment") ? { icon: Truck, cls: "bg-sky-50 text-sky-600" } : { icon: Bell, cls: "bg-slate-100 text-slate-600" });
              const Icon = look.icon;
              return (
                <li key={n.id}>
                  <button
                    className={cn("flex w-full gap-4 px-5 py-4 text-left hover:bg-slate-50", !n.read_at && "bg-brand-50/40")}
                    onClick={() => {
                      if (!n.read_at) readOne.mutate(n.id);
                      if (n.link) router.push(n.link);
                    }}
                  >
                    <div className={cn("h-fit rounded-xl p-2", look.cls)}>
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", n.read_at ? "text-slate-700" : "font-semibold text-slate-900")}>{n.title}</p>
                      {n.body && <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>}
                      <p className="mt-1 text-xs text-slate-400">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={list.data} onChange={setOffset} />
      </Card>
    </>
  );
}
