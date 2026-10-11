import { Badge, type BadgeTone } from "./ui";
import { capitalize } from "@/lib/format";

const tones: Record<string, BadgeTone> = {
  // organizations / products
  pending: "amber",
  active: "green",
  suspended: "red",
  rejected: "red",
  discontinued: "gray",
  // shipments
  in_transit: "blue",
  received: "green",
  cancelled: "gray",
  // reports
  open: "amber",
  investigating: "blue",
  closed: "gray",
  // orders
  confirmed: "blue",
  completed: "green",
  accepted: "blue",
  delivered: "green",
  returned: "red",
  // verification
  genuine: "green",
  warning: "amber",
  expired: "red",
  recalled: "red",
  not_found: "red",
  // inventory
  "low stock": "amber",
  "expiring soon": "amber",
  // roles
  admin: "violet",
  manufacturer: "brand",
  importer: "blue",
  pharmacy: "green",
  patient: "gray",
};

const labels: Record<string, string> = {
  confirmed: "Ready for pickup",
  accepted: "Shipped",
  in_transit: "In transit",
  not_found: "Not registered",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={tones[status] ?? "gray"}>{labels[status] ?? capitalize(status)}</Badge>;
}

export function BatchStateBadge({ recalled, expiresOn }: { recalled: boolean; expiresOn: string }) {
  if (recalled) return <Badge tone="red">Recalled</Badge>;
  const days = Math.round((new Date(`${expiresOn}T00:00:00`).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return <Badge tone="red">Expired</Badge>;
  if (days <= 90) return <Badge tone="amber">Expires in {days}d</Badge>;
  return <Badge tone="green">Active</Badge>;
}
