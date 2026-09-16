"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { ROLE_KEYS, UserStatus, type RoleKey, type User, type UserStatus as UserStatusValue } from "@/lib/domain/auth";
import { CheckboxGroup } from "./checkbox-group";

export interface DeskOption {
  id: string;
  code: string;
  name: string;
}

export interface UserFormProps {
  open: boolean;
  onClose: () => void;
  /** Absent for a create. */
  user: User | null;
  desks: DeskOption[];
  roleLabels: Record<string, string>;
}

const STATUS_OPTIONS = UserStatus.options.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));

/** Create / edit a user. POSTs CreateUserInput or PATCHes UpdateUserInput. */
export function UserForm({ open, onClose, user, desks, roleLabels }: UserFormProps) {
  const router = useRouter();
  const { push } = useToast();
  const editing = user !== null;

  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [title, setTitle] = useState(user?.title ?? "");
  const [status, setStatus] = useState<UserStatusValue>(user?.status ?? "active");
  const [roles, setRoles] = useState<string[]>(user?.roles ?? []);
  const [deskIds, setDeskIds] = useState<string[]>(user?.deskIds ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const invalid = email.trim() === "" || name.trim() === "" || title.trim() === "" || roles.length === 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalid) return;
    setPending(true);
    setError(null);
    setFieldErrors({});
    const body = {
      email: email.trim(),
      name: name.trim(),
      title: title.trim(),
      status,
      roles: roles as RoleKey[],
      deskIds,
    };
    try {
      if (editing) {
        await apiFetch(`/api/users/${user.id}`, { method: "PATCH", body });
      } else {
        await apiFetch("/api/users", { method: "POST", body });
      }
      push({ title: editing ? "User updated" : "User created", description: `${body.name} · ${body.email}`, tone: "positive" });
      onClose();
      router.refresh();
    } catch (e) {
      if (e instanceof ApiClientError) {
        setError(e.message);
        setFieldErrors(e.fieldErrors);
      } else {
        setError("Request failed");
      }
    } finally {
      setPending(false);
    }
  }

  const firstError = (key: string) => fieldErrors[key]?.[0] ?? null;

  return (
    <Drawer
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={editing ? `Edit ${user.name}` : "New user"}
      description={editing ? "Changes take effect on the user's next request." : "The mock login screen lists every active user."}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" variant="primary" size="sm" loading={pending} disabled={invalid}>
            {editing ? "Save changes" : "Create user"}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4" noValidate>
        {error ? (
          <p role="alert" className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
            {error}
          </p>
        ) : null}

        <Field label="Email" htmlFor="user-email" error={firstError("email")}>
          <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" mono />
        </Field>
        <Field label="Name" htmlFor="user-name" error={firstError("name")}>
          <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
        </Field>
        <Field label="Title" htmlFor="user-title" error={firstError("title")} help="Shown on the login picker and the user menu.">
          <Input id="user-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoComplete="off" />
        </Field>
        <Field label="Status" htmlFor="user-status" error={firstError("status")}>
          <Select id="user-status" value={status} onChange={(e) => setStatus(e.target.value as UserStatusValue)} options={STATUS_OPTIONS} />
        </Field>

        <CheckboxGroup
          legend="Roles"
          hint="At least one; permissions are the union."
          error={firstError("roles")}
          name="roles"
          options={ROLE_KEYS.map((key) => ({ value: key, label: roleLabels[key] ?? key }))}
          selected={roles}
          onChange={setRoles}
        />

        <CheckboxGroup
          legend="Desks"
          hint="Ignored for firm-wide roles such as CIO or risk."
          error={firstError("deskIds")}
          name="deskIds"
          options={desks.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))}
          selected={deskIds}
          onChange={setDeskIds}
          emptyText="No desk is visible to your role."
        />
      </form>
    </Drawer>
  );
}
