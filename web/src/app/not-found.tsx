import { ButtonLink } from "@/components/ui";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <LogoMark className="size-12" />
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="max-w-sm text-sm text-slate-500">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <div className="flex gap-3">
        <ButtonLink href="/" variant="secondary">Home</ButtonLink>
        <ButtonLink href="/verify">Verify a medicine</ButtonLink>
      </div>
    </main>
  );
}
