"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { useToast } from "@/components/toast";
import { Button, ButtonLink, Card, EmptyState, ErrorNotice, Input, Loading, Notice, PageHeader, Select, fieldErrors } from "@/components/ui";
import { api, type BatchDetail, type Page, type Product } from "@/lib/api";
import { formatNumber, todayISO } from "@/lib/format";

function NewBatchForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const products = useQuery({
    queryKey: ["products", { status: "active", all: true }],
    queryFn: () => api.get<Page<Product>>("/products", { status: "active", limit: 100 }),
  });
  const [f, setF] = useState({
    product_id: params.get("product") ?? "",
    batch_number: "",
    manufactured_on: todayISO(),
    expires_on: todayISO(730),
    quantity: 1000,
  });
  const create = useMutation({
    mutationFn: () => api.post<BatchDetail>("/batches", { ...f, quantity: Number(f.quantity) }),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`Batch ${b.batch_number} created with ${formatNumber(b.quantity)} pack codes`);
      router.push(`/app/batches/${b.id}`);
    },
  });
  const errs = fieldErrors(create.error);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  if (products.isPending) return <Loading />;
  if (!products.data?.items.length) {
    return (
      <Card>
        <EmptyState
          icon={<QrCode className="size-6" />}
          title="Register a product first"
          body="Batches belong to a product in your catalog."
          action={<ButtonLink href="/app/products/new">Register a product</ButtonLink>}
        />
      </Card>
    );
  }

  return (
    <Card className="max-w-3xl p-6">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Select label="Product" value={f.product_id} onChange={set("product_id")} error={errs.product_id} required>
          <option value="">Choose a product…</option>
          {products.data.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.strength} — {p.dosage_form}
            </option>
          ))}
        </Select>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Batch / lot number" value={f.batch_number} onChange={set("batch_number")} error={errs.batch_number} required placeholder="e.g. AMX-2410" />
          <Input
            label="Number of packs"
            type="number"
            min={1}
            max={50000}
            value={f.quantity}
            onChange={set("quantity")}
            error={errs.quantity}
            hint="One unique code is created per pack (max 50,000)"
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Manufactured on" type="date" value={f.manufactured_on} max={todayISO()} onChange={set("manufactured_on")} error={errs.manufactured_on} required />
          <Input label="Expires on" type="date" value={f.expires_on} onChange={set("expires_on")} error={errs.expires_on} required />
        </div>
        <Notice tone="blue" icon={<QrCode className="size-4" />}>
          Batch details can&apos;t be edited after creation because the codes are printed on packs. If something is wrong, recall the
          batch and create a new one.
        </Notice>
        {create.error && Object.keys(errs).length === 0 && <ErrorNotice error={create.error} />}
        <div className="flex justify-end">
          <Button type="submit" loading={create.isPending}>
            Create batch & mint {formatNumber(Number(f.quantity) || 0)} codes
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function NewBatchPage() {
  return (
    <RoleGate roles={["manufacturer"]}>
      <PageHeader title="New production batch" back={{ href: "/app/batches", label: "Batches" }} />
      <Suspense>
        <NewBatchForm />
      </Suspense>
    </RoleGate>
  );
}
