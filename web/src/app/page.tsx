import {
  BadgeCheck,
  Bell,
  Boxes,
  Building2,
  Check,
  Factory,
  PackageCheck,
  QrCode,
  ScanLine,
  ShieldAlert,
  Ship,
  Store,
  Truck,
  UserRound,
} from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { ButtonLink } from "@/components/ui";

const steps = [
  {
    icon: Factory,
    title: "Manufacturer registers each batch",
    body: "Every pack gets its own unguessable code, printed as a QR label. No two packs share a code.",
  },
  {
    icon: Truck,
    title: "Custody moves with every shipment",
    body: "Importers and pharmacies receive shipments in MediTrack, so we always know who holds each pack.",
  },
  {
    icon: Store,
    title: "Pharmacy dispenses to the patient",
    body: "Scanning at the counter blocks recalled, expired or already-sold packs before they reach anyone.",
  },
  {
    icon: ScanLine,
    title: "Anyone can verify in seconds",
    body: "Scan the QR with a phone camera — no app or account needed — and see the pack's full journey.",
  },
];

const audiences = [
  {
    icon: UserRound,
    title: "Patients",
    points: ["Check any pack for free", "See where it was made and sold", "Report suspicious medicine"],
  },
  {
    icon: Store,
    title: "Pharmacies",
    points: ["Receive stock with one click", "Expiry & low-stock alerts", "Prove your stock is genuine"],
  },
  {
    icon: Ship,
    title: "Importers & distributors",
    points: ["Track every pack you hold", "Ship to pharmacies with a full record", "Instant recall alerts"],
  },
  {
    icon: Factory,
    title: "Manufacturers",
    points: ["Serialize every pack", "See where your stock is, live", "Recall a batch in one step"],
  },
];

const plans = [
  { name: "Patients", price: "Free", period: "forever", features: ["Unlimited verification", "Scan history", "Counterfeit reports"] },
  { name: "Pharmacy", price: "$199", period: "per month", features: ["Inventory & expiry alerts", "Receive & dispense by scan", "Team accounts"] },
  { name: "Importer", price: "$799", period: "per month", features: ["Multi-partner shipments", "Recall management", "Full custody records"] },
  {
    name: "Manufacturer",
    price: "$999",
    period: "per month",
    features: ["Unit-level serialization", "Printable QR labels", "Distribution & scan insights"],
    featured: true,
  },
];

export default function Home() {
  return (
    <>
      <PublicHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:pt-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
                <ShieldAlert className="size-3.5" /> Fighting falsified medicines
              </span>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Know your medicine <span className="text-brand-600">is real.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-slate-600">
                MediTrack gives every medicine pack a unique code and records each hand-off from manufacturer to pharmacy.
                Scan it with your phone to see where it came from — in seconds, for free.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/verify" size="lg">
                  <ScanLine className="size-5" /> Verify a medicine
                </ButtonLink>
                <ButtonLink href="/register" size="lg" variant="secondary">
                  <Building2 className="size-5" /> Join as a business
                </ButtonLink>
              </div>
              <p className="mt-6 text-sm text-slate-500">
                The WHO estimates that 1 in 10 medical products in low- and middle-income countries is substandard or falsified.
              </p>
            </div>

            {/* Illustrative result card */}
            <div className="relative mx-auto w-full max-w-sm">
              <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-brand-200/40 blur-2xl" />
              <div className="rounded-3xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
                <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                  <BadgeCheck className="size-10 text-emerald-600" />
                  <div>
                    <p className="font-bold text-emerald-900">Genuine medicine</p>
                    <p className="text-sm text-emerald-800">Registered by its manufacturer</p>
                  </div>
                </div>
                <div className="mt-5 space-y-1">
                  <p className="text-lg font-semibold">Amoxicillin 500 mg</p>
                  <p className="text-sm text-slate-500">Capsule · Batch AMX-2410 · Expires Mar 2028</p>
                </div>
                <ol className="mt-5 space-y-3 border-l-2 border-brand-100 pl-4 text-sm">
                  {[
                    ["Manufactured", "Addis Pharma, Addis Ababa"],
                    ["Received", "Horn Medical Imports"],
                    ["Received", "Bole Community Pharmacy"],
                    ["Dispensed", "Bole Community Pharmacy"],
                  ].map(([what, who], i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[1.4rem] top-1 size-3 rounded-full bg-brand-500 ring-4 ring-white" />
                      <p className="font-medium text-slate-800">{what}</p>
                      <p className="text-slate-500">{who}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight">How MediTrack works</h2>
              <p className="mt-3 text-slate-600">
                A pack is genuine when its code exists, it travelled through licensed hands, and it hasn&apos;t been recalled,
                expired, or copied. MediTrack checks all of that every time someone scans.
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <div key={s.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
                      <s.icon className="size-6" />
                    </div>
                    <span className="text-sm font-bold text-slate-300">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{s.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 grid gap-4 rounded-2xl bg-slate-900 p-8 text-slate-200 sm:grid-cols-3">
              <div className="flex gap-3">
                <QrCode className="size-6 shrink-0 text-brand-300" />
                <p className="text-sm"><span className="font-semibold text-white">One code per pack.</span> Codes can&apos;t be guessed, so fakes can&apos;t invent valid ones.</p>
              </div>
              <div className="flex gap-3">
                <ShieldAlert className="size-6 shrink-0 text-brand-300" />
                <p className="text-sm"><span className="font-semibold text-white">Copy detection.</span> A real code checked by many different people triggers a warning and alerts the manufacturer.</p>
              </div>
              <div className="flex gap-3">
                <Bell className="size-6 shrink-0 text-brand-300" />
                <p className="text-sm"><span className="font-semibold text-white">Instant recalls.</span> Every holder of a recalled batch is alerted, and scans show it immediately.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Audiences */}
        <section className="bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">Built for the whole supply chain</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {audiences.map((a) => (
                <div key={a.title} className="rounded-2xl p-6 ring-1 ring-slate-200">
                  <a.icon className="size-7 text-brand-600" />
                  <h3 className="mt-4 font-semibold">{a.title}</h3>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    {a.points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-brand-600" /> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight">Simple pricing</h2>
              <p className="mt-3 text-slate-600">
                Free for patients, always. Businesses start with a 30-day free trial once their license is approved.
              </p>
            </div>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => (
                <div
                  key={p.name}
                  className={
                    p.featured
                      ? "rounded-2xl bg-brand-700 p-6 text-white shadow-lg"
                      : "rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
                  }
                >
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-4">
                    <span className="text-4xl font-extrabold tracking-tight">{p.price}</span>
                    <span className={p.featured ? "ml-1 text-sm text-brand-100" : "ml-1 text-sm text-slate-500"}>{p.period}</span>
                  </p>
                  <ul className="mt-6 space-y-2 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className={p.featured ? "size-4 shrink-0 text-brand-200" : "size-4 shrink-0 text-brand-600"} /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="pb-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-gradient-to-r from-brand-700 to-brand-500 p-10 text-white sm:flex-row sm:items-center">
              <div>
                <h2 className="text-2xl font-bold">Holding a medicine right now?</h2>
                <p className="mt-2 text-brand-50">Point your camera at its MediTrack QR code. It takes five seconds.</p>
              </div>
              <div className="flex gap-3">
                <ButtonLink href="/verify" size="lg" variant="secondary">
                  <PackageCheck className="size-5" /> Check it now
                </ButtonLink>
                <ButtonLink href="/register" size="lg" variant="ghost" className="text-white hover:bg-white/10">
                  <Boxes className="size-5" /> For businesses
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
