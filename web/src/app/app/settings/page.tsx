"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LocateFixed, UserPlus } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, ErrorNotice, Input, Loading, Modal, Table, Td, Th, PageHeader, fieldErrors } from "@/components/ui";
import { api, type Me, type Organization, type User } from "@/lib/api";
import { capitalize, currentPosition, formatDate } from "@/lib/format";
import { isActiveOrg, useMe } from "@/lib/session";

function ProfileCard({ me }: { me: Me }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ full_name: me.user.full_name, phone: me.user.phone });
  const save = useMutation({
    mutationFn: () => api.put<Me>("/auth/profile", f),
    onSuccess: (m) => {
      qc.setQueryData(["me"], m);
      toast.success("Profile saved");
    },
  });
  return (
    <Card>
      <CardHeader title="Your profile" description={me.user.email} />
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Input label="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} error={fieldErrors(save.error).full_name} />
        <Input label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>Save</Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [f, setF] = useState({ current_password: "", new_password: "" });
  const save = useMutation({
    mutationFn: () => api.put("/auth/password", f),
    onSuccess: () => {
      setF({ current_password: "", new_password: "" });
      toast.success("Password changed. Other devices were signed out.");
    },
  });
  const errs = fieldErrors(save.error);
  return (
    <Card>
      <CardHeader title="Password" />
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={f.current_password}
          onChange={(e) => setF({ ...f, current_password: e.target.value })}
          error={errs.current_password}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={f.new_password}
          onChange={(e) => setF({ ...f, new_password: e.target.value })}
          error={errs.new_password}
          hint="At least 8 characters"
        />
        {save.error && Object.keys(errs).length === 0 && <ErrorNotice error={save.error} />}
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>Change password</Button>
        </div>
      </form>
    </Card>
  );
}

function OrganizationCard({ org }: { org: Organization }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ address: org.address, phone: org.phone, email: org.email });
  const [lat, setLat] = useState(org.latitude == null ? "" : String(org.latitude));
  const [lng, setLng] = useState(org.longitude == null ? "" : String(org.longitude));
  const [locating, setLocating] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api.put<Organization>("/org", {
        ...f,
        latitude: lat === "" ? null : Number(lat),
        longitude: lng === "" ? null : Number(lng),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Organization details saved");
    },
  });
  return (
    <Card>
      <CardHeader title="Organization" action={<StatusBadge status={org.status} />} />
      <div className="grid gap-x-6 gap-y-2 border-b border-slate-100 px-5 py-4 text-sm sm:grid-cols-2">
        {[
          ["Name", org.name],
          ["Type", capitalize(org.type)],
          ["License", org.license_number],
          ["Location", `${org.city}, ${org.country}`],
          ["Member since", formatDate(org.created_at)],
          ["Trial ends", org.trial_ends_at ? formatDate(org.trial_ends_at) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-1">
            <span className="text-slate-500">{k}</span>
            <span className="text-right font-medium">{v}</span>
          </div>
        ))}
      </div>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Input label="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Business phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <Input label="Business email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={fieldErrors(save.error).email} />
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-900">Location on the map</p>
              <p className="text-xs text-slate-500">
                {org.type === "pharmacy" ? "Patients use this to find the nearest pharmacy and get directions." : "Shown to partners."}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={locating}
              onClick={async () => {
                setLocating(true);
                try {
                  const p = await currentPosition();
                  setLat(p.lat.toFixed(6));
                  setLng(p.lng.toFixed(6));
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setLocating(false);
                }
              }}
            >
              <LocateFixed className="size-4" /> Use my current location
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="9.0105" error={fieldErrors(save.error).latitude} />
            <Input label="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="38.7613" error={fieldErrors(save.error).longitude} />
          </div>
          {lat && lng && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs font-medium text-brand-700"
            >
              Check this spot on the map ↗
            </a>
          )}
        </div>
        <p className="text-xs text-slate-500">Name, type and license are verified by MediTrack and can only be changed by contacting support.</p>
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>Save</Button>
        </div>
      </form>
    </Card>
  );
}

function TeamCard({ canAdd }: { canAdd: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const empty = { full_name: "", email: "", phone: "", password: "" };
  const [f, setF] = useState(empty);
  const members = useQuery({ queryKey: ["org", "members"], queryFn: () => api.get<User[]>("/org/members") });
  const add = useMutation({
    mutationFn: () => api.post<User>("/org/members", f),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["org", "members"] });
      setOpen(false);
      setF(empty);
      toast.success(`${u.full_name} can now sign in`);
    },
  });
  const errs = fieldErrors(add.error);
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Team"
        description="Everyone here acts on behalf of your organization."
        action={canAdd && <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><UserPlus className="size-4" /> Add member</Button>}
      />
      {members.isPending ? (
        <Loading />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Joined</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.data?.map((m) => (
              <tr key={m.id}>
                <Td className="font-medium text-slate-900">{m.full_name}</Td>
                <Td>{m.email}</Td>
                <Td>{m.phone || "—"}</Td>
                <Td>{formatDate(m.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a team member"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={add.isPending} onClick={() => add.mutate()}>Add member</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} error={errs.full_name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errs.email} />
            <Input label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </div>
          <Input
            label="Temporary password"
            type="text"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
            error={errs.password}
            hint="Share it securely; they should change it after signing in."
          />
          {add.error && Object.keys(errs).length === 0 && <ErrorNotice error={add.error} />}
        </div>
      </Modal>
    </Card>
  );
}

export default function SettingsPage() {
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileCard me={me} />
        <PasswordCard />
        {me.organization && <OrganizationCard org={me.organization} />}
        {me.organization && <TeamCard canAdd={isActiveOrg(me)} />}
      </div>
    </>
  );
}
