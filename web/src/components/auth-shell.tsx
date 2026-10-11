import { ShieldCheck } from "lucide-react";
import { Logo } from "./logo";

export function AuthShell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="relative">
          <Logo light />
        </div>
        <div className="relative max-w-md">
          <ShieldCheck className="size-10 text-brand-200" />
          <p className="mt-6 text-3xl font-bold leading-tight">Every pack accounted for, from factory to patient.</p>
          <p className="mt-4 text-brand-100">
            Manufacturers, importers and pharmacies use MediTrack to prove their medicines are genuine — and to stop fakes
            before they reach anyone.
          </p>
        </div>
        <p className="relative text-sm text-brand-200">Free for patients. 30-day trial for businesses.</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className={wide ? "w-full max-w-2xl" : "w-full max-w-md"}>
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
