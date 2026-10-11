"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Pill, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { StatusBadge } from "@/components/status";
import { ButtonLink, Card, EmptyState, ErrorNotice, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th } from "@/components/ui";
import { api, type Page, type Product } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useMe } from "@/lib/session";

export default function ProductsPage() {
  const { data: me } = useMe();
  const isAdmin = me?.user.role === "admin";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const products = useQuery({
    queryKey: ["products", { q, status, offset }],
    queryFn: () => api.get<Page<Product>>("/products", { q, status, offset }),
    placeholderData: keepPreviousData,
  });

  return (
    <RoleGate roles={["manufacturer", "admin"]}>
      <PageHeader
        title="Products"
        description={isAdmin ? "Every medicine registered on MediTrack." : "Your registered medicines. Each batch you create belongs to a product."}
        actions={!isAdmin && <ButtonLink href="/app/products/new"><Plus className="size-4" /> New product</ButtonLink>}
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
              placeholder="Search by brand or generic name"
              className="pl-9"
              aria-label="Search products"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
            className="w-44"
            aria-label="Status"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="discontinued">Discontinued</option>
          </Select>
        </div>
        <ErrorNotice error={products.error} className="m-4" />
        {products.isPending ? (
          <Loading />
        ) : !products.data?.items.length ? (
          <EmptyState
            icon={<Pill className="size-6" />}
            title={q || status ? "No matching products" : "No products yet"}
            body={!isAdmin && !q ? "Register your first medicine to start creating batches with unique pack codes." : undefined}
            action={!isAdmin && !q && <ButtonLink href="/app/products/new">Register a product</ButtonLink>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                {isAdmin && <Th>Manufacturer</Th>}
                <Th>Form</Th>
                <Th>Category</Th>
                <Th className="text-right">Batches</Th>
                <Th className="text-right">Packs</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.data.items.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/app/products/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {p.name} {p.strength}
                    </Link>
                    <p className="text-xs text-slate-500">{p.generic_name}</p>
                  </Td>
                  {isAdmin && <Td>{p.manufacturer_name}</Td>}
                  <Td>{p.dosage_form}</Td>
                  <Td>{p.category || "—"}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(p.batch_count)}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(p.unit_count)}</Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={products.data} onChange={setOffset} />
      </Card>
    </RoleGate>
  );
}
