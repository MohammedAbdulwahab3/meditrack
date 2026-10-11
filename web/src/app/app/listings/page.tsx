"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tags } from "lucide-react";
import { useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, ErrorNotice, Input, Loading, PageHeader, Table, Td, Th } from "@/components/ui";
import { api, type Listing } from "@/lib/api";
import { isActiveOrg, useMe } from "@/lib/session";

function ListingRow({ l, canEdit }: { l: Listing; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [price, setPrice] = useState(l.unit_price == null ? "" : String(l.unit_price));
  const [listed, setListed] = useState(l.listed || l.unit_price == null);
  const dirty = price !== (l.unit_price == null ? "" : String(l.unit_price)) || listed !== l.listed;
  const save = useMutation({
    mutationFn: () => api.put(`/listings/${l.product_id}`, { unit_price: Number(price), listed }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listings"] });
      qc.invalidateQueries({ queryKey: ["offers"] });
      toast.success(`${l.name} ${l.strength} ${listed ? "is listed" : "is hidden"} at ETB ${Number(price).toFixed(2)}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const available = l.sellable - l.reserved;
  const visible = l.listed && l.unit_price != null && available > 0 && l.product_status === "active";

  return (
    <tr className="align-middle">
      <Td>
        <p className="font-medium text-slate-900">
          {l.name} {l.strength}
        </p>
        <p className="text-xs text-slate-500">
          {l.generic_name} · {l.dosage_form} · {l.manufacturer_name}
        </p>
      </Td>
      <Td className="text-right tabular-nums">
        {available}
        {l.reserved > 0 && <p className="text-xs text-slate-400">{l.reserved} held</p>}
      </Td>
      <Td>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">ETB</span>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={!canEdit}
            className="w-28 text-right"
            aria-label={`Price for ${l.name}`}
          />
        </div>
      </Td>
      <Td>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={listed}
            disabled={!canEdit}
            onChange={(e) => setListed(e.target.checked)}
            className="size-4 rounded border-slate-300 text-brand-600"
          />
          Listed
        </label>
      </Td>
      <Td>
        {visible ? (
          <Badge tone="green">Visible to buyers</Badge>
        ) : l.unit_price == null ? (
          <Badge tone="gray">No price</Badge>
        ) : !l.listed ? (
          <Badge tone="gray">Hidden</Badge>
        ) : l.product_status !== "active" ? (
          <Badge tone="red">Product {l.product_status}</Badge>
        ) : (
          <Badge tone="amber">Out of stock</Badge>
        )}
      </Td>
      <Td className="text-right">
        <Button size="sm" variant={dirty ? "primary" : "secondary"} disabled={!canEdit || !dirty || !(Number(price) > 0)} loading={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </Td>
    </tr>
  );
}

export default function ListingsPage() {
  const { data: me } = useMe();
  const listings = useQuery({ queryKey: ["listings"], queryFn: () => api.get<Listing[]>("/listings") });
  const buyers = me?.user.role === "pharmacy" ? "patients" : "pharmacies";
  return (
    <RoleGate roles={["manufacturer", "importer", "pharmacy"]}>
      <PageHeader
        title="Prices & listings"
        description={`Set a price per pack. Listed products with genuine, in-date stock are shown to ${buyers}.`}
      />
      <Card>
        <ErrorNotice error={listings.error} className="m-4" />
        {listings.isPending ? (
          <Loading />
        ) : !listings.data?.length ? (
          <EmptyState icon={<Tags className="size-6" />} title="Nothing to list yet" body="Products appear here once you hold stock of them." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Medicine</Th>
                <Th className="text-right">Available</Th>
                <Th>Price per pack</Th>
                <Th>Listing</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listings.data.map((l) => (
                <ListingRow key={`${l.product_id}-${l.unit_price}-${l.listed}`} l={l} canEdit={isActiveOrg(me)} />
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </RoleGate>
  );
}
