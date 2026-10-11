"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  ClipboardCheck,
  Search,
  ShoppingCart,
  Tags,
  Boxes,
  Building2,
  ClipboardList,
  Flag,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Pill,
  ScanLine,
  ScrollText,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api, type Me, type Role } from "@/lib/api";
import { capitalize, formatDate } from "@/lib/format";
import { useLogout } from "@/lib/session";
import { LogoMark } from "./logo";
import { Notice, cn } from "./ui";

type NavItem = { href: string; label: string; icon: React.ElementType };

const nav: Record<Role, NavItem[]> = {
  manufacturer: [
    { href: "/app", label: "Dashboard", icon: LayoutDashboard },
    { href: "/app/products", label: "Products", icon: Pill },
    { href: "/app/batches", label: "Batches & labels", icon: Boxes },
    { href: "/app/inventory", label: "Inventory", icon: Package },
    { href: "/app/orders", label: "Orders", icon: ClipboardCheck },
    { href: "/app/listings", label: "Prices & listings", icon: Tags },
    { href: "/app/shipments", label: "Shipments", icon: Truck },
  ],
  importer: [
    { href: "/app", label: "Dashboard", icon: LayoutDashboard },
    { href: "/app/inventory", label: "Inventory", icon: Package },
    { href: "/app/orders", label: "Orders", icon: ClipboardCheck },
    { href: "/app/listings", label: "Prices & listings", icon: Tags },
    { href: "/app/shipments", label: "Shipments", icon: Truck },
  ],
  pharmacy: [
    { href: "/app", label: "Dashboard", icon: LayoutDashboard },
    { href: "/app/orders", label: "Orders", icon: ClipboardCheck },
    { href: "/app/dispense", label: "Dispense", icon: ShoppingBag },
    { href: "/app/inventory", label: "Inventory", icon: Package },
    { href: "/app/buy", label: "Buy stock", icon: ShoppingCart },
    { href: "/app/listings", label: "Prices & listings", icon: Tags },
    { href: "/app/shipments", label: "Shipments", icon: Truck },
  ],
  patient: [
    { href: "/app", label: "Verify medicine", icon: ScanLine },
    { href: "/app/find", label: "Find medicine", icon: Search },
    { href: "/app/orders", label: "My orders", icon: ClipboardCheck },
    { href: "/app/scans", label: "Scan history", icon: History },
    { href: "/app/reports", label: "My reports", icon: Flag },
  ],
  admin: [
    { href: "/app", label: "Overview", icon: LayoutDashboard },
    { href: "/app/admin/organizations", label: "Organizations", icon: Building2 },
    { href: "/app/admin/users", label: "Users", icon: Users },
    { href: "/app/products", label: "Products", icon: Pill },
    { href: "/app/batches", label: "Batches & recalls", icon: Boxes },
    { href: "/app/shipments", label: "Shipments", icon: Truck },
    { href: "/app/orders", label: "Orders", icon: ClipboardCheck },
    { href: "/app/admin/reports", label: "Counterfeit reports", icon: ClipboardList },
    { href: "/app/admin/audit", label: "Audit log", icon: ScrollText },
  ],
};

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const pathname = usePathname();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const unread = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 30_000,
  });
  const items = [
    ...nav[me.user.role],
    { href: "/app/notifications", label: "Notifications", icon: Bell },
    { href: "/app/settings", label: "Settings", icon: Settings },
  ];
  const org = me.organization;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <LogoMark className="size-7" />
        <span className="font-bold tracking-tight text-white">
          Medi<span className="text-brand-300">Track</span>
        </span>
      </div>
      <div className="mx-3 mb-4 rounded-xl bg-white/5 p-3">
        <p className="truncate text-sm font-semibold text-white">{org?.name ?? me.user.full_name}</p>
        <p className="text-xs text-brand-200">{capitalize(org?.type ?? me.user.role)}</p>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const count = item.href === "/app/notifications" ? unread.data?.count ?? 0 : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active ? "bg-white/10 text-white" : "text-brand-100 hover:bg-white/5 hover:text-white",
              )}
            >
              <item.icon className="size-4.5 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {count > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
            {me.user.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{me.user.full_name}</p>
            <p className="truncate text-xs text-brand-200">{me.user.email}</p>
          </div>
          <button onClick={logout} className="rounded-lg p-1.5 text-brand-200 hover:bg-white/10 hover:text-white" title="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 bg-brand-950 lg:block">{sidebar}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-72 bg-brand-950">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 p-1 text-brand-100" aria-label="Close menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <LogoMark className="size-7" />
          <Link href="/app/notifications" className="relative rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
            <Bell className="size-5" />
            {(unread.data?.count ?? 0) > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-rose-500" />}
          </Link>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {org && org.status !== "active" && <OrgStatusBanner status={org.status} reason={org.status_reason} />}
          {org?.status === "active" && org.trial_ends_at && new Date(org.trial_ends_at) > new Date() && pathname === "/app" && (
            <p className="mb-4 text-xs text-slate-500">Free trial until {formatDate(org.trial_ends_at)}.</p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

function OrgStatusBanner({ status, reason }: { status: string; reason: string }) {
  if (status === "pending") {
    return (
      <Notice tone="amber" title="Your organization is awaiting approval" className="mb-6">
        An administrator is verifying your license. You&apos;ll get a notification as soon as you can start registering and
        moving medicines.
      </Notice>
    );
  }
  return (
    <Notice tone="red" title={`Your organization is ${status}`} className="mb-6">
      {reason || "Contact MediTrack support for details."}
    </Notice>
  );
}
