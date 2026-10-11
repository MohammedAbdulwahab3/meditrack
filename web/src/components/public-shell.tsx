"use client";

import Link from "next/link";
import { Logo } from "./logo";
import { ButtonLink } from "./ui";
import { useMe } from "@/lib/session";

export function PublicHeader() {
  const { data: me } = useMe();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <Link href="/verify" className="hover:text-slate-900">Verify a medicine</Link>
          <Link href="/find" className="hover:text-slate-900">Find medicine</Link>
          <Link href="/#how" className="hover:text-slate-900">How it works</Link>
          <Link href="/#pricing" className="hover:text-slate-900">Pricing</Link>
          <Link href="/report" className="hover:text-slate-900">Report a fake</Link>
        </nav>
        <div className="flex items-center gap-2">
          {me ? (
            <ButtonLink href="/app">Open dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" className="hidden sm:inline-flex">Sign in</ButtonLink>
              <ButtonLink href="/register">Get started</ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo />
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/verify" className="hover:text-slate-800">Verify</Link>
          <Link href="/find" className="hover:text-slate-800">Find medicine</Link>
          <Link href="/report" className="hover:text-slate-800">Report a fake</Link>
          <Link href="/register" className="hover:text-slate-800">For businesses</Link>
          <Link href="/login" className="hover:text-slate-800">Sign in</Link>
        </div>
        <p>© {new Date().getFullYear()} MediTrack</p>
      </div>
    </footer>
  );
}
