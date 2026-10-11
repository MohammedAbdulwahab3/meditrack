"use client";

import { AdminDashboard, BusinessDashboard, PatientDashboard } from "@/components/dashboards";
import { useMe } from "@/lib/session";

export default function DashboardPage() {
  const { data: me } = useMe();
  if (!me) return null;
  switch (me.user.role) {
    case "admin":
      return <AdminDashboard me={me} />;
    case "patient":
      return <PatientDashboard me={me} />;
    default:
      return <BusinessDashboard me={me} />;
  }
}
