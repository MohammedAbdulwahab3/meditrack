import { FindMedicine } from "@/components/find-medicine";
import { PublicFooter, PublicHeader } from "@/components/public-shell";

export const metadata = { title: "Find medicine" };

export default function PublicFindPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Find medicine near you</h1>
        <p className="mb-8 mt-2 text-slate-600">
          See which pharmacies have a medicine in stock and what it costs. Reserve it online and pay when you collect.
        </p>
        <FindMedicine />
      </main>
      <PublicFooter />
    </>
  );
}
