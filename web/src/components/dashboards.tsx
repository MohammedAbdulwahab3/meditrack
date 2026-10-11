"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Boxes,
  Building2,
  CalendarClock,
  ClipboardList,
  Package,
  PackageCheck,
  Pill,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type AdminOrg, type Batch, type Inventory, type Me, type MyScan, type Page, type Shipment, type Stats } from "@/lib/api";
import { capitalize, formatDate, formatNumber, normalizeCode, timeAgo } from "@/lib/format";
import { ScanChart } from "./scan-chart";
import { Scanner } from "./scanner";
import { StatusBadge } from "./status";
import { ButtonLink, Card, CardHeader, EmptyState, ErrorNotice, Loading, PageHeader, Stat } from "./ui";

const greeting = (me: Me) => `Welcome, ${me.user.full_name.split(" ")[0]}`;

// ---- Admin ----

export function AdminDashboard({ me }: { me: Me }) {
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: () => api.get<Stats>("/admin/stats") });
  const pending = useQuery({
    queryKey: ["admin", "orgs", "pending-preview"],
    queryFn: () => api.get<Page<AdminOrg>>("/admin/organizations", { status: "pending", limit: 5 }),
  });
  const s = stats.data;
  return (
    <>
      <PageHeader title="Platform overview" description={`Signed in as ${me.user.full_name}`} />
      <ErrorNotice error={stats.error} className="mb-4" />
      {!s ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Pending approvals"
              value={formatNumber(s.organizations.pending ?? 0)}
              hint="Organizations waiting for review"
              icon={<Building2 className="size-5" />}
              tone={(s.organizations.pending ?? 0) > 0 ? "amber" : "slate"}
              href="/app/admin/organizations?status=pending"
            />
            <Stat
              label="Open counterfeit reports"
              value={formatNumber(s.open_reports)}
              icon={<ClipboardList className="size-5" />}
              tone={s.open_reports > 0 ? "red" : "slate"}
              href="/app/admin/reports"
            />
            <Stat
              label="Packs tracked"
              value={formatNumber(s.units)}
              hint={`${formatNumber(s.units_dispensed)} dispensed to patients`}
              icon={<Package className="size-5" />}
            />
            <Stat
              label="Active recalls"
              value={formatNumber(s.active_recalls)}
              hint={`${formatNumber(s.batches)} batches · ${formatNumber(s.products)} products`}
              icon={<Ban className="size-5" />}
              tone={s.active_recalls > 0 ? "red" : "slate"}
              href="/app/batches?state=recalled"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Public checks, last 14 days" description="Verifications by patients and the public" />
              <div className="p-5">
                <ScanChart data={s.scans_daily} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Check results, last 30 days" />
              <ul className="divide-y divide-slate-100">
                {(["genuine", "warning", "expired", "recalled", "suspended", "not_found"] as const).map((k) => (
                  <li key={k} className="flex items-center justify-between px-5 py-3 text-sm">
                    <StatusBadge status={k} />
                    <span className="font-semibold tabular-nums text-slate-900">{formatNumber(s.scans_30d[k] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Waiting for approval"
                action={<ButtonLink href="/app/admin/organizations?status=pending" variant="secondary" size="sm">Review all</ButtonLink>}
              />
              {pending.data?.items.length ? (
                <ul className="divide-y divide-slate-100">
                  {pending.data.items.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{o.name}</p>
                        <p className="text-xs text-slate-500">
                          {capitalize(o.type)} · {o.city} · License {o.license_number}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">{timeAgo(o.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<ShieldCheck className="size-6" />} title="All caught up" body="No organizations are waiting for review." />
              )}
            </Card>
            <Card>
              <CardHeader title="Network" />
              <ul className="divide-y divide-slate-100 text-sm">
                {[
                  ["Manufacturers", s.organization_types.manufacturer],
                  ["Importers", s.organization_types.importer],
                  ["Pharmacies", s.organization_types.pharmacy],
                  ["Patients", s.users.patient],
                ].map(([label, n]) => (
                  <li key={label as string} className="flex justify-between px-5 py-3">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-semibold tabular-nums">{formatNumber((n as number) ?? 0)}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-100 p-3">
                <Link href="/app/admin/users" className="flex items-center justify-center gap-1 text-sm font-medium text-brand-700">
                  <Users className="size-4" /> Manage users
                </Link>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

// ---- Business (manufacturer / importer / pharmacy) ----

function IncomingShipments() {
  const q = useQuery({
    queryKey: ["shipments", { direction: "in", status: "in_transit" }],
    queryFn: () => api.get<Page<Shipment>>("/shipments", { direction: "in", status: "in_transit", limit: 5 }),
  });
  return (
    <Card>
      <CardHeader title="Incoming shipments" description="Check them on arrival, then receive or reject." />
      {q.isPending ? (
        <Loading />
      ) : q.data?.items.length ? (
        <ul className="divide-y divide-slate-100">
          {q.data.items.map((s) => (
            <li key={s.id}>
              <Link href={`/app/shipments/${s.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.reference}</p>
                  <p className="truncate text-xs text-slate-500">
                    From {s.from.name} · {formatNumber(s.total_units)} packs
                  </p>
                </div>
                <ArrowRight className="size-4 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Truck className="size-6" />} title="Nothing on the way" body="Shipments sent to you will appear here." />
      )}
    </Card>
  );
}

function InventoryStats({ inv }: { inv: Inventory }) {
  const s = inv.summary;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Packs in stock" value={formatNumber(s.total_units)} hint={`${s.products} products`} icon={<Package className="size-5" />} href="/app/inventory" />
      <Stat
        label="Low stock"
        value={formatNumber(s.low_stock)}
        hint="Products below your minimum"
        icon={<AlertTriangle className="size-5" />}
        tone={s.low_stock ? "amber" : "slate"}
        href="/app/inventory?filter=low"
      />
      <Stat
        label="Expiring in 90 days"
        value={formatNumber(s.expiring_soon)}
        hint={s.expired ? `${formatNumber(s.expired)} already expired` : "Packs"}
        icon={<CalendarClock className="size-5" />}
        tone={s.expiring_soon || s.expired ? "amber" : "slate"}
        href="/app/inventory?filter=expiring"
      />
      <Stat
        label="Recalled packs"
        value={formatNumber(s.recalled)}
        hint="Quarantine and return these"
        icon={<Ban className="size-5" />}
        tone={s.recalled ? "red" : "slate"}
        href="/app/inventory?filter=recalled"
      />
    </div>
  );
}

export function BusinessDashboard({ me }: { me: Me }) {
  const active = me.organization?.status === "active";
  const inv = useQuery({ queryKey: ["inventory"], queryFn: () => api.get<Inventory>("/inventory"), enabled: active });
  const role = me.user.role;
  const batches = useQuery({
    queryKey: ["batches", { limit: 5 }],
    queryFn: () => api.get<Page<Batch>>("/batches", { limit: 5 }),
    enabled: active && role === "manufacturer",
  });

  const actions =
    role === "manufacturer" ? (
      <>
        <ButtonLink href="/app/products/new" variant="secondary"><Pill className="size-4" /> New product</ButtonLink>
        <ButtonLink href="/app/batches/new"><Boxes className="size-4" /> New batch</ButtonLink>
      </>
    ) : role === "pharmacy" ? (
      <>
        <ButtonLink href="/app/shipments/new" variant="secondary"><Truck className="size-4" /> Transfer stock</ButtonLink>
        <ButtonLink href="/app/dispense"><ShoppingBag className="size-4" /> Dispense</ButtonLink>
      </>
    ) : (
      <ButtonLink href="/app/shipments/new"><Truck className="size-4" /> New shipment</ButtonLink>
    );

  return (
    <>
      <PageHeader title={greeting(me)} description={me.organization?.name} actions={active ? actions : undefined} />
      {!active ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title="We're reviewing your registration"
            body="Once approved you can register products, receive shipments and manage stock. Meanwhile, complete your team in Settings."
            action={<ButtonLink href="/app/settings" variant="secondary">Go to settings</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <ErrorNotice error={inv.error} />
          {inv.data ? <InventoryStats inv={inv.data} /> : <Loading />}
          <div className="grid gap-6 lg:grid-cols-2">
            {role === "manufacturer" ? (
              <Card>
                <CardHeader title="Recent batches" action={<ButtonLink href="/app/batches" variant="secondary" size="sm">All batches</ButtonLink>} />
                {batches.data?.items.length ? (
                  <ul className="divide-y divide-slate-100">
                    {batches.data.items.map((b) => (
                      <li key={b.id}>
                        <Link href={`/app/batches/${b.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {b.product.name} {b.product.strength} · {b.batch_number}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatNumber(b.quantity)} packs · {formatNumber(b.distribution.dispensed)} dispensed · expires {formatDate(b.expires_on)}
                            </p>
                          </div>
                          {b.recalled_at && <StatusBadge status="recalled" />}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={<Boxes className="size-6" />}
                    title="No batches yet"
                    body="Register a product, then create a batch to mint a unique code for each pack."
                    action={<ButtonLink href="/app/products/new">Register a product</ButtonLink>}
                  />
                )}
              </Card>
            ) : (
              <IncomingShipments />
            )}
            {role === "manufacturer" ? <IncomingShipments /> : <LowStockList inv={inv.data} />}
          </div>
        </div>
      )}
    </>
  );
}

function LowStockList({ inv }: { inv?: Inventory }) {
  const attention = (inv?.products ?? [])
    .filter((p) => p.low_stock || p.batches.some((b) => b.in_stock > 0 && (b.recalled || b.expired || b.expiring_soon)))
    .slice(0, 6);
  return (
    <Card>
      <CardHeader title="Needs attention" action={<ButtonLink href="/app/inventory" variant="secondary" size="sm">Inventory</ButtonLink>} />
      {attention.length ? (
        <ul className="divide-y divide-slate-100">
          {attention.map((p) => {
            const recalled = p.batches.some((b) => b.recalled && b.in_stock > 0);
            const expired = p.batches.some((b) => b.expired && b.in_stock > 0);
            return (
              <li key={p.product_id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {p.name} {p.strength}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatNumber(p.sellable)} sellable{p.min_quantity != null && ` · minimum ${p.min_quantity}`}
                  </p>
                </div>
                <StatusBadge status={recalled ? "recalled" : expired ? "expired" : p.low_stock ? "low stock" : "expiring soon"} />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<PackageCheck className="size-6" />} title="Stock looks healthy" body="Low-stock, expiry and recall issues show up here." />
      )}
    </Card>
  );
}

// ---- Patient ----

export function PatientDashboard({ me }: { me: Me }) {
  const router = useRouter();
  const scans = useQuery({ queryKey: ["me", "scans", 0], queryFn: () => api.get<Page<MyScan>>("/me/scans", { limit: 5 }) });
  return (
    <>
      <PageHeader
        title={greeting(me)}
        description="Scan a pack to check it's genuine, or find a pharmacy that has your medicine."
        actions={<ButtonLink href="/app/find"><Pill className="size-4" /> Find medicine</ButtonLink>}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4 sm:p-6">
          <Scanner
            onScan={(text) => {
              const c = normalizeCode(text);
              if (c.length === 12) router.push(`/v/${c}`);
            }}
          />
          <div className="mt-4 text-center">
            <ButtonLink href="/verify" variant="ghost" size="sm">
              <ScanLine className="size-4" /> Type a code instead
            </ButtonLink>
          </div>
        </Card>
        <Card>
          <CardHeader title="Recent checks" action={<ButtonLink href="/app/scans" variant="secondary" size="sm">History</ButtonLink>} />
          {scans.data?.items.length ? (
            <ul className="divide-y divide-slate-100">
              {scans.data.items.map((s, i) => (
                <li key={i}>
                  <Link href={`/v/${normalizeCode(s.code)}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.product_name || "Unknown product"}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{s.code}</span> · {timeAgo(s.checked_at)}
                      </p>
                    </div>
                    <StatusBadge status={s.result} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<ScanLine className="size-6" />} title="No checks yet" body="Medicines you verify while signed in are saved here." />
          )}
        </Card>
      </div>
    </>
  );
}
