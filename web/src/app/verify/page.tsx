"use client";

import { ArrowRight, Keyboard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { Scanner } from "@/components/scanner";
import { Button, Card, Input } from "@/components/ui";
import { normalizeCode } from "@/lib/format";

export default function VerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const go = (raw: string) => {
    const c = normalizeCode(raw);
    if (c.length !== 12) {
      setError("MediTrack codes have 12 characters, like ABCD-EFGH-JKMN.");
      return;
    }
    router.push(`/v/${c}`);
  };

  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-xl px-4 py-10 sm:py-14">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Verify a medicine</h1>
          <p className="mt-2 text-slate-600">Scan the MediTrack QR code on the pack, or type the code printed under it.</p>
        </div>

        <Card className="mt-8 p-4 sm:p-6">
          <Scanner onScan={go} />
          <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> or enter the code <span className="h-px flex-1 bg-slate-200" />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go(code);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError("");
                }}
                placeholder="ABCD-EFGH-JKMN"
                autoCapitalize="characters"
                autoComplete="off"
                className="pl-9 font-mono uppercase tracking-wider"
                aria-label="Pack code"
                error={error}
              />
            </div>
            <Button type="submit">
              Check <ArrowRight className="size-4" />
            </Button>
          </form>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        </Card>

        <p className="mt-6 text-center text-xs text-slate-500">
          Checking is free and anonymous. We record that a check happened so we can spot copied codes.
        </p>
      </main>
      <PublicFooter />
    </>
  );
}
