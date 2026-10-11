"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { ErrorNotice, Loading } from "@/components/ui";
import { VerifyResultView } from "@/components/verify-result";
import { api, type VerifyResult } from "@/lib/api";

// Landing page for a scanned QR code: https://<site>/v/<CODE>
export default function VerifyCodePage() {
  const { code } = useParams<{ code: string }>();
  // Each request records a check, so fetch exactly once per visit.
  const q = useQuery({
    queryKey: ["verify", code],
    queryFn: () => api.get<VerifyResult>(`/verify/${encodeURIComponent(code)}`),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        {q.isPending && <Loading label="Checking this pack…" />}
        {q.error && <ErrorNotice error={q.error} />}
        {q.data && <VerifyResultView result={q.data} />}
      </main>
      <PublicFooter />
    </>
  );
}
