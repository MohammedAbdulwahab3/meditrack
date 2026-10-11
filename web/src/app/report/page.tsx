"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Flag } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { Button, ButtonLink, Card, ErrorNotice, Input, Textarea, fieldErrors } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/session";

function ReportForm() {
  const params = useSearchParams();
  const { data: me } = useMe();
  const [form, setForm] = useState({
    code: params.get("code") ?? "",
    product_name: "",
    place: "",
    contact: "",
    description: "",
  });
  const submit = useMutation({ mutationFn: () => api.post("/reports", form) });
  const errs = fieldErrors(submit.error);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (submit.isSuccess) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
        <h1 className="mt-4 text-xl font-bold">Thank you — report received</h1>
        <p className="mt-2 text-sm text-slate-600">
          Our team reviews every report. If you left contact details, or you&apos;re signed in, we&apos;ll follow up with you.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/verify" variant="secondary">Verify another pack</ButtonLink>
          {me && <ButtonLink href="/app/reports">My reports</ButtonLink>}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-rose-50 p-2.5 text-rose-600">
          <Flag className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Report a suspicious medicine</h1>
          <p className="text-sm text-slate-500">Tell us what you found. Reports go straight to the MediTrack team.</p>
        </div>
      </div>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <Input label="Pack code (if there is one)" value={form.code} onChange={set("code")} placeholder="ABCD-EFGH-JKMN" className="font-mono uppercase" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Medicine name" value={form.product_name} onChange={set("product_name")} placeholder="e.g. Amoxicillin 500 mg" />
          <Input label="Where did you get it?" value={form.place} onChange={set("place")} placeholder="Pharmacy name, area, city" />
        </div>
        <Textarea
          label="What looked wrong?"
          value={form.description}
          onChange={set("description")}
          placeholder="Broken seal, different colour or taste, misspelled packaging, no QR code…"
          error={errs.description}
          required
        />
        {!me && (
          <Input
            label="Phone or email (optional)"
            value={form.contact}
            onChange={set("contact")}
            hint="Only used if we need more details."
          />
        )}
        {submit.error && !errs.description && <ErrorNotice error={submit.error} />}
        <Button type="submit" loading={submit.isPending} className="w-full" size="lg" variant="danger">
          Send report
        </Button>
      </form>
    </Card>
  );
}

export default function ReportPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-xl px-4 py-10">
        <Suspense>
          <ReportForm />
        </Suspense>
      </main>
      <PublicFooter />
    </>
  );
}
