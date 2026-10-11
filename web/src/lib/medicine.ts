import type { Offer } from "./api";
import { formatMoney } from "./format";
import { medicineFormOf, type MedicineForm } from "@/components/medicine-art";

export type LatLng = { lat: number; lng: number };

/** One medicine and every pharmacy that has it in stock. */
export interface MedicineGroup {
  product: Offer["product"];
  offers: Offer[];
  form: MedicineForm;
  minPrice: number;
  nearestKm: number | null;
  currency: string;
}

export function byDistance(a: Offer, b: Offer) {
  const da = a.distance_km, db = b.distance_km;
  if (da != null && db != null && da !== db) return da - db;
  if (da == null && db != null) return 1;
  if (da != null && db == null) return -1;
  return a.unit_price - b.unit_price;
}

export const byPrice = (a: Offer, b: Offer) => a.unit_price - b.unit_price || byDistance(a, b);

/** Groups offers per medicine; medicines in stock closest to the patient come first. */
export function groupOffers(offers: Offer[]): MedicineGroup[] {
  const byId = new Map<string, Offer[]>();
  for (const o of offers) byId.set(o.product.id, [...(byId.get(o.product.id) ?? []), o]);
  const groups = [...byId.values()].map((list) => {
    list.sort(byDistance);
    const kms = list.map((o) => o.distance_km).filter((d): d is number => d != null);
    return {
      product: list[0].product,
      offers: list,
      form: medicineFormOf(list[0].product.dosage_form),
      minPrice: Math.min(...list.map((o) => o.unit_price)),
      nearestKm: kms.length ? Math.min(...kms) : null,
      currency: list[0].currency,
    };
  });
  return groups.sort((a, b) => {
    const da = a.nearestKm, db = b.nearestKm;
    if (da != null && db != null && Math.abs(da - db) > 0.05) return da - db;
    if (da == null && db != null) return 1;
    if (da != null && db == null) return -1;
    return b.offers.length - a.offers.length;
  });
}

/** Money without trailing ".00", for compact labels. */
export const shortMoney = (n: number, currency = "ETB") => formatMoney(n, currency).replace(/\.00$/, "");

export const hasLocation = (s: Offer["seller"]) => s.latitude != null && s.longitude != null;

export interface DrivingRoute {
  points: [number, number][];
  km: number;
  minutes: number;
  approximate: boolean;
}

function straightKm(a: LatLng, b: LatLng) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** A driving route from the public OSRM server, or a straight line if it can't be reached. */
export async function drivingRoute(from: LatLng, to: LatLng): Promise<DrivingRoute> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const body = await res.json();
      const r = body.routes?.[0];
      if (r) {
        return {
          points: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
          km: r.distance / 1000,
          minutes: r.duration / 60,
          approximate: false,
        };
      }
    }
  } catch {
    // fall through to a straight line
  }
  const km = straightKm(from, to);
  return { points: [[from.lat, from.lng], [to.lat, to.lng]], km, minutes: (km / 25) * 60, approximate: true };
}

export function formatDuration(minutes: number) {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
