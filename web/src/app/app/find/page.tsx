"use client";

import { FindMedicine } from "@/components/find-medicine";
import { RoleGate } from "@/components/role-gate";
import { PageHeader } from "@/components/ui";

export default function FindPage() {
  return (
    <RoleGate roles={["patient"]}>
      <PageHeader title="Find medicine" description="Compare pharmacies, reserve online, and pay when you collect." />
      <FindMedicine />
    </RoleGate>
  );
}
