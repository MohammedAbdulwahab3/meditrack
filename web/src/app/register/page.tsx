"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Factory, Ship, Store, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button, ErrorNotice, Input, cn, fieldErrors } from "@/components/ui";
import { api, type Me, type OrgType } from "@/lib/api";

type Kind = "patient" | "business";

const orgTypes: { value: OrgType; label: string; icon: React.ElementType; body: string }[] = [
  { value: "manufacturer", label: "Manufacturer", icon: Factory, body: "You produce medicines" },
  { value: "importer", label: "Importer / distributor", icon: Ship, body: "You import or wholesale" },
  { value: "pharmacy", label: "Pharmacy", icon: Store, body: "You dispense to patients" },
];

export default function RegisterPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("patient");
  const [person, setPerson] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [org, setOrg] = useState({
    name: "",
    type: "pharmacy" as OrgType,
    license_number: "",
    country: "Ethiopia",
    city: "",
    address: "",
    phone: "",
    email: "",
  });

  const register = useMutation({
    mutationFn: () =>
      kind === "patient"
        ? api.post<{ me: Me }>("/auth/register/patient", person)
        : api.post<{ me: Me }>("/auth/register/business", { ...person, organization: org }),
    onSuccess: (data) => {
      qc.setQueryData(["me"], data.me);
      router.replace("/app");
    },
  });
  const errs = fieldErrors(register.error);
  const setP = (k: keyof typeof person) => (e: React.ChangeEvent<HTMLInputElement>) => setPerson((p) => ({ ...p, [k]: e.target.value }));
  const setO = (k: keyof typeof org) => (e: React.ChangeEvent<HTMLInputElement>) => setOrg((o) => ({ ...o, [k]: e.target.value }));

  return (
    <AuthShell wide>
      <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-slate-500">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-brand-700">
          Sign in
        </Link>
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {(
          [
            ["patient", UserRound, "I'm a patient", "Check medicines and keep a history"],
            ["business", Building2, "I'm a business", "Manufacturer, importer or pharmacy"],
          ] as const
        ).map(([value, Icon, title, body]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={cn(
              "rounded-xl p-4 text-left ring-1 transition",
              kind === value ? "bg-brand-50 ring-2 ring-brand-600" : "bg-white ring-slate-200 hover:ring-slate-300",
            )}
          >
            <Icon className={cn("size-6", kind === value ? "text-brand-700" : "text-slate-400")} />
            <p className="mt-2 text-sm font-semibold">{title}</p>
            <p className="text-xs text-slate-500">{body}</p>
          </button>
        ))}
      </div>

      <form
        className="mt-6 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          register.mutate();
        }}
      >
        <fieldset className="space-y-4">
          {kind === "business" && <legend className="mb-3 text-sm font-semibold text-slate-900">Your details</legend>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Full name" value={person.full_name} onChange={setP("full_name")} error={errs.full_name} required autoComplete="name" />
            <Input label="Phone" value={person.phone} onChange={setP("phone")} autoComplete="tel" placeholder="+251 9…" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Email" type="email" value={person.email} onChange={setP("email")} error={errs.email} required autoComplete="email" />
            <Input
              label="Password"
              type="password"
              value={person.password}
              onChange={setP("password")}
              error={errs.password}
              hint="At least 8 characters"
              required
              autoComplete="new-password"
            />
          </div>
        </fieldset>

        {kind === "business" && (
          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold text-slate-900">Your organization</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {orgTypes.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setOrg((o) => ({ ...o, type: t.value }))}
                  className={cn(
                    "rounded-xl p-3 text-left ring-1 transition",
                    org.type === t.value ? "bg-brand-50 ring-2 ring-brand-600" : "bg-white ring-slate-200 hover:ring-slate-300",
                  )}
                >
                  <t.icon className={cn("size-5", org.type === t.value ? "text-brand-700" : "text-slate-400")} />
                  <p className="mt-1.5 text-sm font-semibold">{t.label}</p>
                  <p className="text-xs text-slate-500">{t.body}</p>
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Organization name" value={org.name} onChange={setO("name")} error={errs["organization.name"]} required />
              <Input
                label="License number"
                value={org.license_number}
                onChange={setO("license_number")}
                error={errs["organization.license_number"]}
                hint="We verify this before approving your account"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Country" value={org.country} onChange={setO("country")} error={errs["organization.country"]} required />
              <Input label="City" value={org.city} onChange={setO("city")} error={errs["organization.city"]} required />
            </div>
            <Input label="Address" value={org.address} onChange={setO("address")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Business phone" value={org.phone} onChange={setO("phone")} />
              <Input label="Business email" type="email" value={org.email} onChange={setO("email")} error={errs["organization.email"]} />
            </div>
          </fieldset>
        )}

        {register.error && Object.keys(errs).length === 0 && <ErrorNotice error={register.error} />}
        <Button type="submit" size="lg" className="w-full" loading={register.isPending}>
          {kind === "patient" ? "Create account" : "Submit for approval"}
        </Button>
        {kind === "business" && (
          <p className="text-center text-xs text-slate-500">
            An administrator reviews new organizations, usually within one business day. You can sign in meanwhile.
          </p>
        )}
      </form>
    </AuthShell>
  );
}
