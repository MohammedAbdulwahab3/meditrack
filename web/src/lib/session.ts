"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ApiError, api, type Me } from "./api";

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<Me>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return async () => {
    await api.post("/auth/logout").catch(() => {});
    qc.clear();
    router.replace("/login");
  };
}

/** True when a business user's organization can act (approved). */
export function isActiveOrg(me: Me | null | undefined) {
  return !!me?.organization && me.organization.status === "active";
}
