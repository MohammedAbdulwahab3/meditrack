"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLogout } from "@/lib/session";
import { AuthShell } from "./auth-shell";
import { Button, ErrorNotice, Input, fieldErrors } from "./ui";

/** Shown instead of the app after an admin password reset, until the user picks a new password. */
export function ForcePasswordChange({ email }: { email: string }) {
  const qc = useQueryClient();
  const logout = useLogout();
  const [f, setF] = useState({ current_password: "", new_password: "", confirm: "" });
  const [mismatch, setMismatch] = useState(false);
  const save = useMutation({
    mutationFn: () => api.put("/auth/password", { current_password: f.current_password, new_password: f.new_password }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const errs = fieldErrors(save.error);

  return (
    <AuthShell>
      <div className="mb-6 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        <KeyRound className="size-6" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-sm text-slate-600">
        An administrator reset the password for <span className="font-medium text-slate-900">{email}</span>. Enter the temporary password
        you were given, then pick your own.
      </p>
      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (f.new_password !== f.confirm) return setMismatch(true);
          setMismatch(false);
          save.mutate();
        }}
      >
        <Input
          label="Temporary password"
          autoComplete="current-password"
          value={f.current_password}
          onChange={(e) => setF({ ...f, current_password: e.target.value.trim().toUpperCase() })}
          error={errs.current_password}
          placeholder="XXXX-XXXX-XXXX"
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
        <Input
          label="Repeat new password"
          type="password"
          autoComplete="new-password"
          value={f.confirm}
          onChange={(e) => setF({ ...f, confirm: e.target.value })}
          error={mismatch ? "The passwords don't match." : undefined}
        />
        {save.error && Object.keys(errs).length === 0 && <ErrorNotice error={save.error} />}
        <Button type="submit" size="lg" className="w-full" loading={save.isPending}>
          Save and continue
        </Button>
        <button type="button" onClick={logout} className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700">
          Sign out
        </button>
      </form>
    </AuthShell>
  );
}
