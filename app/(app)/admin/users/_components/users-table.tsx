"use client";

import { useState } from "react";
import { formatNumber, formatRelative, humanize } from "@/lib/ui/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { PencilIcon, PlusIcon } from "@/components/icons";
import type { User } from "@/lib/domain/auth";
import type { Tone } from "@/lib/ui/status";
import { UserForm, type DeskOption } from "./user-form";

export interface UsersTableProps {
  users: User[];
  desks: DeskOption[];
  roleLabels: Record<string, string>;
  canManage: boolean;
  now: number;
}

const STATUS_TONE: Record<User["status"], Tone> = { active: "positive", suspended: "negative", invited: "warning" };

function makeColumns(
  deskNames: Record<string, string>,
  roleLabels: Record<string, string>,
  canManage: boolean,
  now: number,
  onEdit: (user: User) => void,
): Column<User>[] {
  return [
    {
      key: "name",
      header: "User",
      render: (u) => (
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: u.avatarColor }} />
          <span className="block min-w-0">
            <span className="block truncate font-medium text-fg">{u.name}</span>
            <span className="num block truncate text-2xs text-fg-subtle">{u.email}</span>
          </span>
        </span>
      ),
    },
    { key: "title", header: "Title", render: (u) => <span className="truncate text-fg-muted">{u.title}</span> },
    {
      key: "roles",
      header: "Roles",
      render: (u) => (
        <span className="flex flex-wrap gap-1">
          {u.roles.map((role) => (
            <Badge key={role} tone="accent" size="xs" dot={false} title={roleLabels[role] ?? role}>
              {roleLabels[role] ?? humanize(role)}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: "desks",
      header: "Desks",
      render: (u) =>
        u.deskIds.length === 0 ? (
          <span className="text-fg-subtle">All desks</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {u.deskIds.map((deskId) => (
              <Badge key={deskId} tone="muted" size="xs" dot={false}>
                {deskNames[deskId] ?? deskId}
              </Badge>
            ))}
          </span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "6rem",
      render: (u) => (
        <Badge tone={STATUS_TONE[u.status]} size="xs">
          {humanize(u.status)}
        </Badge>
      ),
    },
    {
      key: "lastLoginAt",
      header: "Last login",
      align: "right",
      render: (u) => <span className="text-fg-subtle">{u.lastLoginAt ? formatRelative(u.lastLoginAt, now) : "Never"}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "5rem",
      render: (u) => (
        <Button
          size="xs"
          variant="ghost"
          icon={<PencilIcon size={12} />}
          disabled={!canManage}
          title={canManage ? undefined : "Requires users:manage"}
          aria-label={`Edit ${u.name}`}
          onClick={() => onEdit(u)}
        >
          Edit
        </Button>
      ),
    },
  ];
}

/** User directory with create/edit in a drawer. */
export function UsersTable({ users, desks, roleLabels, canManage, now }: UsersTableProps) {
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  const deskNames: Record<string, string> = {};
  for (const desk of desks) deskNames[desk.id] = desk.code;

  const open = creating || editing !== null;

  return (
    <Card>
      <CardHeader
        actions={
          <>
            <span className="num text-2xs text-fg-subtle">{formatNumber(users.length)} users</span>
            <Button
              size="xs"
              variant="primary"
              icon={<PlusIcon size={12} />}
              disabled={!canManage}
              title={canManage ? undefined : "Requires users:manage"}
              onClick={() => setCreating(true)}
            >
              New user
            </Button>
          </>
        }
      >
        <CardTitle hint="directory">Users</CardTitle>
      </CardHeader>

      <DataTable
        columns={makeColumns(deskNames, roleLabels, canManage, now, setEditing)}
        rows={users}
        rowKey={(u) => u.id}
        caption="Platform users"
        className="max-h-[38rem]"
        emptyTitle="No users"
        emptyDescription="No user is visible to your role, or the platform has not been seeded yet."
      />

      {open ? (
        <UserForm
          key={editing?.id ?? "new"}
          open
          user={editing}
          desks={desks}
          roleLabels={roleLabels}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      ) : null}
    </Card>
  );
}
