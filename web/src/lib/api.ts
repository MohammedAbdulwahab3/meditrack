// Typed client for the MediTrack Go API. All calls go to the same origin (/api), so the
// httpOnly session cookie is sent automatically. The X-Requested-With header is required
// by the backend on cookie-authenticated writes (CSRF protection).

export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;
  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${withQuery(path, query)}`, {
      method,
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "meditrack-web",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "offline", "You appear to be offline. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  // A non-JSON 5xx means the request never reached the API (e.g. the backend is down).
  if (!data && res.status >= 500) {
    throw new ApiError(503, "unavailable", "Can't reach the MediTrack server right now. Please try again in a moment.");
  }
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? "error", e.message ?? "Request failed.", e.fields ?? {});
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
};

// ---- Types (mirror backend/internal/app) ----

export type Role = "admin" | "manufacturer" | "importer" | "pharmacy" | "patient";
export type OrgType = "manufacturer" | "importer" | "pharmacy";
export type OrgStatus = "pending" | "active" | "suspended" | "rejected";

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  type: OrgType;
  license_number: string;
  country: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  status: OrgStatus;
  status_reason: string;
  approved_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
}

export interface Me {
  user: User;
  organization: Organization | null;
}

export interface Product {
  id: string;
  manufacturer_id: string;
  manufacturer_name: string;
  name: string;
  generic_name: string;
  strength: string;
  dosage_form: string;
  category: string;
  pack_size: string;
  description: string;
  requires_prescription: boolean;
  status: "active" | "suspended" | "discontinued";
  status_reason: string;
  batch_count: number;
  unit_count: number;
  created_at: string;
}

export interface Distribution {
  with_manufacturer: number;
  in_transit: number;
  with_partners: number;
  dispensed: number;
}

export interface Batch {
  id: string;
  product: { id: string; name: string; strength: string; dosage_form: string };
  manufacturer_id: string;
  manufacturer_name: string;
  batch_number: string;
  manufactured_on: string;
  expires_on: string;
  quantity: number;
  recalled_at: string | null;
  recall_reason: string;
  created_at: string;
  distribution: Distribution;
}

export interface Holding {
  organization_id: string;
  organization_name: string;
  organization_type: OrgType;
  city: string;
  in_stock: number;
  in_transit: number;
}

export interface BatchDetail extends Batch {
  holdings: Holding[];
}

export interface UnitLabel {
  serial: number;
  code: string;
}

export interface Party {
  id: string;
  name: string;
  type: OrgType;
  city: string;
}

export interface ShipmentLine {
  batch_id: string;
  batch_number: string;
  product_id: string;
  product_name: string;
  strength: string;
  dosage_form: string;
  expires_on: string;
  recalled: boolean;
  quantity: number;
}

export type ShipmentStatus = "in_transit" | "received" | "rejected" | "cancelled";

export interface Shipment {
  id: string;
  reference: string;
  from: Party;
  to: Party;
  status: ShipmentStatus;
  notes: string;
  rejection_reason: string;
  total_units: number;
  created_at: string;
  closed_at: string | null;
  lines?: ShipmentLine[];
}

export interface DirectoryEntry {
  id: string;
  name: string;
  type: OrgType;
  city: string;
  country: string;
}

export interface StockBatch {
  batch_id: string;
  batch_number: string;
  expires_on: string;
  days_to_expiry: number;
  expired: boolean;
  expiring_soon: boolean;
  recalled: boolean;
  recall_reason: string;
  in_stock: number;
  in_transit_out: number;
}

export interface StockProduct {
  product_id: string;
  name: string;
  strength: string;
  dosage_form: string;
  manufacturer_name: string;
  in_stock: number;
  sellable: number;
  min_quantity: number | null;
  low_stock: boolean;
  batches: StockBatch[];
}

export interface Inventory {
  summary: {
    total_units: number;
    products: number;
    low_stock: number;
    expiring_soon: number;
    expired: number;
    recalled: number;
    in_transit_out: number;
  };
  products: StockProduct[];
}

export interface DispenseResult {
  code: string;
  ok: boolean;
  message: string;
  product_name?: string;
  batch_number?: string;
}

export interface DispensedUnit {
  code: string;
  product_name: string;
  batch_number: string;
  dispensed_at: string;
}

export type VerifyStatus = "genuine" | "warning" | "expired" | "recalled" | "suspended" | "not_found";

export interface VerifyOrg {
  name: string;
  type: string;
  city: string;
  country: string;
}

export interface JourneyStep {
  kind: "manufactured" | "shipped" | "received" | "returned" | "dispensed";
  at: string;
  org: VerifyOrg;
  to?: VerifyOrg;
}

export interface VerifyResult {
  status: VerifyStatus;
  headline: string;
  message: string;
  code: string;
  serial?: number;
  unit_state?: "in_stock" | "in_transit" | "dispensed";
  product?: {
    name: string;
    generic_name: string;
    strength: string;
    dosage_form: string;
    pack_size: string;
    requires_prescription: boolean;
  };
  manufacturer?: VerifyOrg;
  batch_number?: string;
  manufactured_on?: string;
  expires_on?: string;
  recall_reason?: string;
  current_holder?: VerifyOrg;
  dispensed_at?: string;
  dispensed_by?: VerifyOrg;
  previous_checks: number;
  first_checked_at?: string;
  distinct_checkers: number;
  journey?: JourneyStep[];
}

export interface MyScan {
  code: string;
  result: VerifyStatus;
  product_name: string;
  batch_number: string;
  checked_at: string;
}

export interface Report {
  id: string;
  code: string;
  known_code: boolean;
  product_name: string;
  place: string;
  contact: string;
  description: string;
  status: "open" | "investigating" | "closed";
  admin_note: string;
  reporter_name: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
}

export interface Stats {
  organizations: Record<string, number>;
  organization_types: Record<string, number>;
  users: Record<string, number>;
  products: number;
  batches: number;
  active_recalls: number;
  units: number;
  units_dispensed: number;
  scans_30d: Record<string, number>;
  scans_daily: { day: string; count: number }[];
  open_reports: number;
}

export interface AdminOrg extends Organization {
  members: number;
  products: number;
}

export interface AdminUser extends User {
  organization_id: string | null;
  organization_name: string | null;
  last_login_at: string | null;
}

export interface AuditEvent {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  actor_email: string | null;
  organization_name: string | null;
  created_at: string;
}

// ---- Marketplace ----

export interface Listing {
  product_id: string;
  name: string;
  generic_name: string;
  strength: string;
  dosage_form: string;
  manufacturer_name: string;
  requires_prescription: boolean;
  product_status: string;
  unit_price: number | null;
  currency: string;
  listed: boolean;
  sellable: number;
  reserved: number;
}

export interface Offer {
  seller: {
    id: string;
    name: string;
    type: OrgType;
    city: string;
    address: string;
    phone: string;
    latitude: number | null;
    longitude: number | null;
  };
  product: {
    id: string;
    name: string;
    generic_name: string;
    strength: string;
    dosage_form: string;
    pack_size: string;
    category: string;
    requires_prescription: boolean;
    manufacturer_name: string;
  };
  unit_price: number;
  currency: string;
  available: number;
  earliest_expiry: string;
  distance_km: number | null;
}

export type OrderStatus = "pending" | "confirmed" | "completed" | "accepted" | "delivered" | "returned" | "rejected" | "cancelled";

export interface OrderParty {
  id: string;
  name: string;
  type: string;
  city: string;
  address: string;
  phone: string;
}

export interface Order {
  id: string;
  reference: string;
  kind: "retail" | "wholesale";
  status: OrderStatus;
  buyer: OrderParty;
  seller: OrderParty;
  items: {
    product_id: string;
    name: string;
    generic_name: string;
    strength: string;
    dosage_form: string;
    requires_prescription: boolean;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[];
  total: number;
  currency: string;
  note: string;
  decline_reason: string;
  shipment_id: string | null;
  requires_prescription: boolean;
  packs: { code: string; product_name: string; batch_number: string; expires_on: string }[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}
