"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { StatusBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, ErrorNotice, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th } from "@/components/ui";
import { api, type AdminUser, type Page } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/format";
import { useMe } from "@/lib/session";

export default function AdminUsersPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const users = useQuery({
    queryKey: ["admin", "users", { role, q, offset }],
    queryFn: () => api.get<Page<AdminUser>>("/admin/users", { role, q, offset }),
    placeholderData: keepPreviousData,
  });
  const toggle = useMutation({
    mutationFn: (u: AdminUser) => api.post(`/admin/users/${u.id}/active`, { active: !u.is_active }),
    onSuccess: (_, u) => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success(`${u.full_name} ${u.is_active ? "deactivated" : "reactivated"}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <RoleGate roles={["admin"]}>
      <PageHeader title="Users" description="Everyone with a MediTrack account. Deactivating a user signs them out everywhere." />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
              placeholder="Name or email"
              className="pl-9"
              aria-label="Search users"
            />
          </div>
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setOffset(0);
            }}
            className="w-44"
            aria-label="Role"
          >
            <option value="">All roles</option>
            <option value="admin">Admins</option>
            <option value="manufacturer">Manufacturers</option>
            <option value="importer">Importers</option>
            <option value="pharmacy">Pharmacies</option>
            <option value="patient">Patients</option>
          </Select>
        </div>
        <ErrorNotice error={users.error} className="m-4" />
        {users.isPending ? (
          <Loading />
        ) : !users.data?.items.length ? (
          <EmptyState icon={<Users className="size-6" />} title="No users found" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Organization</Th>
                <Th>Joined</Th>
                <Th>Last sign-in</Th>
                <Th className="text-right">Account</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.data.items.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <p className="font-medium text-slate-900">{u.full_name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </Td>
                  <Td><StatusBadge status={u.role} /></Td>
                  <Td>{u.organization_name ?? "—"}</Td>
                  <Td>{formatDate(u.created_at)}</Td>
                  <Td>{u.last_login_at ? timeAgo(u.last_login_at) : "Never"}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!u.is_active && <Badge tone="red">Deactivated</Badge>}
                      {u.id !== me?.user.id && (
                        <Button size="sm" variant="secondary" loading={toggle.isPending && toggle.variables?.id === u.id} onClick={() => toggle.mutate(u)}>
                          {u.is_active ? "Deactivate" : "Reactivate"}
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={users.data} onChange={setOffset} />
      </Card>
    </RoleGate>
  );
}
