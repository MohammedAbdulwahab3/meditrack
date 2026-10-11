"use client";

import { useState } from "react";
import type { Product } from "@/lib/api";
import { Button, Checkbox, ErrorNotice, Input, Select, Textarea, fieldErrors } from "./ui";

export type ProductInput = {
  name: string;
  generic_name: string;
  strength: string;
  dosage_form: string;
  category: string;
  pack_size: string;
  description: string;
  requires_prescription: boolean;
};

const dosageForms = ["Tablet", "Capsule", "Syrup", "Suspension", "Injection", "Cream", "Ointment", "Drops", "Inhaler", "Powder", "Other"];
const categories = [
  "Antibiotic",
  "Analgesic",
  "Antimalarial",
  "Antiretroviral",
  "Antihypertensive",
  "Antidiabetic",
  "Vaccine",
  "Vitamin / supplement",
  "Gastrointestinal",
  "Respiratory",
  "Other",
];

export function ProductForm({
  initial,
  onSubmit,
  submitting,
  error,
  submitLabel,
}: {
  initial?: Product;
  onSubmit: (input: ProductInput) => void;
  submitting: boolean;
  error: unknown;
  submitLabel: string;
}) {
  const [f, setF] = useState<ProductInput>({
    name: initial?.name ?? "",
    generic_name: initial?.generic_name ?? "",
    strength: initial?.strength ?? "",
    dosage_form: initial?.dosage_form ?? "Tablet",
    category: initial?.category ?? "",
    pack_size: initial?.pack_size ?? "",
    description: initial?.description ?? "",
    requires_prescription: initial?.requires_prescription ?? false,
  });
  const errs = fieldErrors(error);
  const set = (k: keyof ProductInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(f);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Brand name" value={f.name} onChange={set("name")} error={errs.name} required placeholder="e.g. Amoxil" />
        <Input
          label="Generic name (INN)"
          value={f.generic_name}
          onChange={set("generic_name")}
          error={errs.generic_name}
          required
          placeholder="e.g. Amoxicillin"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="Strength" value={f.strength} onChange={set("strength")} error={errs.strength} required placeholder="500 mg" />
        <Select label="Dosage form" value={f.dosage_form} onChange={set("dosage_form")} error={errs.dosage_form}>
          {dosageForms.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
        <Input label="Pack size" value={f.pack_size} onChange={set("pack_size")} placeholder="e.g. 2 × 10 capsules" />
      </div>
      <Select label="Category" value={f.category} onChange={set("category")}>
        <option value="">Choose…</option>
        {categories.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Select>
      <Textarea label="Description" value={f.description} onChange={set("description")} placeholder="Indications, storage, notes…" />
      <Checkbox
        label="Prescription-only medicine"
        checked={f.requires_prescription}
        onChange={(e) => setF((p) => ({ ...p, requires_prescription: e.target.checked }))}
      />
      {error && Object.keys(errs).length === 0 ? <ErrorNotice error={error} /> : null}
      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
