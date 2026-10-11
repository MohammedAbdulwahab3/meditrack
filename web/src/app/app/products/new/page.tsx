"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ProductForm, type ProductInput } from "@/components/product-form";
import { RoleGate } from "@/components/role-gate";
import { useToast } from "@/components/toast";
import { Card, PageHeader } from "@/components/ui";
import { api, type Product } from "@/lib/api";

export default function NewProductPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: (input: ProductInput) => api.post<Product>("/products", input),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(`${p.name} registered`);
      router.push(`/app/products/${p.id}`);
    },
  });
  return (
    <RoleGate roles={["manufacturer"]}>
      <PageHeader
        title="Register a product"
        description="Add a medicine to your catalog. You'll create batches (with pack codes) for it next."
        back={{ href: "/app/products", label: "Products" }}
      />
      <Card className="max-w-3xl p-6">
        <ProductForm onSubmit={(i) => create.mutate(i)} submitting={create.isPending} error={create.error} submitLabel="Register product" />
      </Card>
    </RoleGate>
  );
}
