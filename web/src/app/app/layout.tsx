"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { ForcePasswordChange } from "@/components/force-password";
import { ErrorNotice, Loading } from "@/components/ui";
import { useMe } from "@/lib/session";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isPending, error } = useMe();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isPending && me === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isPending, me, pathname, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorNotice error={error} />
      </div>
    );
  }
  if (isPending || !me) return <Loading />;
  if (me.user.must_change_password) return <ForcePasswordChange email={me.user.email} />;
  return <AppShell me={me}>{children}</AppShell>;
}
