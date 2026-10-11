const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const numberFmt = new Intl.NumberFormat("en-US");

/** Dates like "2026-10-11" are calendar dates; parse them without a timezone shift. */
function parse(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

export const formatDate = (value?: string | null) => (value ? dateFmt.format(parse(value)) : "—");
export const formatDateTime = (value?: string | null) => (value ? dateTimeFmt.format(parse(value)) : "—");
export const formatNumber = (n?: number | null) => (n == null ? "—" : numberFmt.format(n));

export function timeAgo(value: string) {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).replaceAll("_", " ") : s);

export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Mirrors the backend's NormalizeCode: accepts URLs, dashes, lowercase and look-alike letters. */
export function normalizeCode(input: string) {
  let s = input.trim();
  const i = s.lastIndexOf("/v/");
  if (i >= 0) s = s.slice(i + 3);
  s = s.split(/[?#]/)[0];
  return s
    .toUpperCase()
    .replaceAll("O", "0")
    .replace(/[IL]/g, "1")
    .replace(/[^0-9A-Z]/g, "");
}

export function formatCode(code: string) {
  const c = normalizeCode(code);
  return c.length === 12 ? `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}` : c;
}

const moneyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatMoney = (n: number, currency = "ETB") => `${currency} ${moneyFmt.format(n)}`;

export const formatDistance = (km?: number | null) =>
  km == null ? "" : km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;

/** Asks the browser for the current position. */
export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Location isn't available in this browser."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location.")),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}
