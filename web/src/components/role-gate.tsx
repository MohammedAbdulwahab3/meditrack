"use client";

import { Lock } from "lucide-react";
import type { Role } from "@/lib/api";
import { useMe } from "@/lib/session";
import { ButtonLink, Card, EmptyState } from "./ui";

/** Renders children only for the given roles; everyone else sees a friendly dead end. */
export function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { data: me } = useMe();
  if (!me) return null;
  if (!roles.includes(me.user.role)) {
    return (
      <Card>
        <EmptyState
          icon={<Lock className="size-6" />}
          title="This page isn't part of your workspace"
          body="Your account type doesn't use this section."
          action={<ButtonLink href="/app">Back to dashboard</ButtonLink>}
        />
      </Card>
    );
  }
  return <>{children}</>;
}
