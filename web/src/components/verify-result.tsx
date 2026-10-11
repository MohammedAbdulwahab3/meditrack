import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  CalendarX2,
  Factory,
  Flag,
  PackageCheck,
  ScanLine,
  ShieldX,
  Store,
  Truck,
  Undo2,
} from "lucide-react";
import type { JourneyStep, VerifyResult, VerifyStatus } from "@/lib/api";
import { capitalize, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ButtonLink, Card } from "./ui";

const look: Record<VerifyStatus, { icon: React.ElementType; box: string; iconColor: string }> = {
  genuine: { icon: BadgeCheck, box: "bg-emerald-50 ring-emerald-200 text-emerald-950", iconColor: "text-emerald-600" },
  warning: { icon: AlertTriangle, box: "bg-amber-50 ring-amber-200 text-amber-950", iconColor: "text-amber-600" },
  expired: { icon: CalendarX2, box: "bg-rose-50 ring-rose-200 text-rose-950", iconColor: "text-rose-600" },
  recalled: { icon: Ban, box: "bg-rose-50 ring-rose-200 text-rose-950", iconColor: "text-rose-600" },
  suspended: { icon: Ban, box: "bg-rose-50 ring-rose-200 text-rose-950", iconColor: "text-rose-600" },
  not_found: { icon: ShieldX, box: "bg-rose-50 ring-rose-200 text-rose-950", iconColor: "text-rose-600" },
};

const stepInfo: Record<JourneyStep["kind"], { icon: React.ElementType; label: (s: JourneyStep) => string }> = {
  manufactured: { icon: Factory, label: () => "Manufactured" },
  shipped: { icon: Truck, label: (s) => `Shipped to ${s.to?.name ?? "partner"}` },
  received: { icon: PackageCheck, label: () => "Received" },
  returned: { icon: Undo2, label: () => "Rejected and returned" },
  dispensed: { icon: Store, label: () => "Dispensed to a patient" },
};

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export function VerifyResultView({ result }: { result: VerifyResult }) {
  const l = look[result.status];
  const Icon = l.icon;
  return (
    <div className="space-y-5">
      <div className={cn("rounded-2xl p-5 ring-1", l.box)}>
        <div className="flex items-start gap-4">
          <Icon className={cn("size-12 shrink-0", l.iconColor)} />
          <div>
            <h1 className="text-xl font-bold">{result.headline}</h1>
            <p className="mt-1 text-sm opacity-90">{result.message}</p>
          </div>
        </div>
        {result.status === "recalled" && result.recall_reason && (
          <p className="mt-3 rounded-lg bg-white/60 p-3 text-sm">
            <span className="font-semibold">Recall reason:</span> {result.recall_reason}
          </p>
        )}
      </div>

      {result.product && (
        <Card className="p-5">
          <p className="text-lg font-semibold">
            {result.product.name} {result.product.strength}
          </p>
          <p className="text-sm text-slate-500">
            {result.product.generic_name} · {result.product.dosage_form}
            {result.product.pack_size && ` · ${result.product.pack_size}`}
          </p>
          {result.product.requires_prescription && (
            <p className="mt-2 inline-block rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800">Prescription medicine</p>
          )}
          <dl className="mt-4 divide-y divide-slate-100">
            <Row label="Manufacturer" value={result.manufacturer && `${result.manufacturer.name}, ${result.manufacturer.country}`} />
            <Row label="Batch" value={result.batch_number} />
            <Row label="Manufactured" value={formatDate(result.manufactured_on)} />
            <Row label="Expires" value={formatDate(result.expires_on)} />
            <Row label="Pack code" value={<span className="font-mono">{result.code}</span>} />
            {result.dispensed_by ? (
              <Row label="Sold by" value={`${result.dispensed_by.name}, ${result.dispensed_by.city} · ${formatDate(result.dispensed_at)}`} />
            ) : (
              result.current_holder && (
                <Row
                  label={result.unit_state === "in_transit" ? "Shipped by" : "Currently held by"}
                  value={`${result.current_holder.name}, ${result.current_holder.city}`}
                />
              )
            )}
          </dl>
          {!result.dispensed_by && result.current_holder?.type === "pharmacy" && (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              This pack is recorded at <span className="font-semibold">{result.current_holder.name}</span>. If you bought it
              somewhere else, ask the seller where it came from.
            </p>
          )}
        </Card>
      )}

      {result.journey && result.journey.length > 0 && (
        <Card className="p-5">
          <h2 className="font-semibold">Supply chain journey</h2>
          <ol className="mt-4 space-y-4">
            {result.journey.map((s, i) => {
              const info = stepInfo[s.kind];
              const StepIcon = info.icon;
              return (
                <li key={i} className="relative flex gap-3">
                  {i < result.journey!.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%-12px)] w-px bg-slate-200" />}
                  <div className="z-10 shrink-0 self-start rounded-full bg-brand-50 p-2 text-brand-700 ring-4 ring-white">
                    <StepIcon className="size-4" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-medium text-slate-900">{info.label(s)}</p>
                    <p className="text-sm text-slate-500">
                      {s.org.name} · {capitalize(s.org.type)}, {s.org.city}
                    </p>
                    <p className="text-xs text-slate-400">{formatDateTime(s.at)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {result.status !== "not_found" && (
        <p className="text-center text-xs text-slate-500">
          {result.previous_checks === 0
            ? "This is the first time this pack has been checked."
            : `Checked ${result.previous_checks} time${result.previous_checks === 1 ? "" : "s"} before${
                result.first_checked_at ? `, first on ${formatDate(result.first_checked_at)}` : ""
              }.`}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink href="/verify" variant="secondary">
          <ScanLine className="size-4" /> Check another pack
        </ButtonLink>
        <ButtonLink href={`/report?code=${encodeURIComponent(result.code)}`} variant={result.status === "genuine" ? "ghost" : "danger"}>
          <Flag className="size-4" /> Report a problem
        </ButtonLink>
      </div>
    </div>
  );
}
