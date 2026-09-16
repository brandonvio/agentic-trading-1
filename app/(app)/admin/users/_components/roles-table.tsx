import { formatNumber } from "@/lib/ui/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageGuard } from "@/app/(app)/_components/guard";
import type { Role } from "@/lib/domain/auth";
import { loadRoles } from "./data";

/** Group a role's permissions by their `resource:` prefix for scannability. */
function byResource(permissions: string[]): Array<[string, string[]]> {
  const groups = new Map<string, string[]>();
  for (const permission of permissions) {
    const resource = permission.split(":")[0] ?? permission;
    const list = groups.get(resource) ?? [];
    list.push(permission);
    groups.set(resource, list);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function RoleRow({ role }: { role: Role }) {
  return (
    <tr className="border-b border-edge/60 align-top last:border-b-0">
      <th scope="row" className="px-3 py-2.5 text-left align-top">
        <span className="num block text-xs font-medium text-fg">{role.key}</span>
        <span className="mt-0.5 block text-2xs font-normal text-fg-subtle">{role.name}</span>
      </th>
      <td className="px-3 py-2.5 text-xs text-fg-muted">{role.description}</td>
      <td className="num px-3 py-2.5 text-right align-top text-xs text-fg">{formatNumber(role.permissions.length)}</td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-1.5">
          {byResource(role.permissions).map(([resource, permissions]) => (
            <div key={resource} className="flex flex-wrap items-center gap-1">
              <span className="label-caps w-20 shrink-0">{resource}</span>
              {permissions.map((permission) => (
                <Badge key={permission} tone="muted" size="xs" mono dot={false}>
                  {permission.slice(resource.length + 1) || permission}
                </Badge>
              ))}
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

/** Reference table: every role and the permissions it grants. */
export async function RolesTable() {
  const roles = await loadRoles();

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="RBAC reference">Roles</CardTitle>
      </CardHeader>
      <PageGuard result={roles} what="the role catalogue">
        {(list) =>
          list.length === 0 ? (
            <div className="p-6">
              <EmptyState compact title="No roles" description="The role catalogue is empty." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <caption className="sr-only">Roles and the permissions each one grants</caption>
                <thead className="bg-surface-1">
                  <tr className="border-b border-edge">
                    <th scope="col" className="label-caps h-8 w-40 px-3 text-left font-medium">
                      Role
                    </th>
                    <th scope="col" className="label-caps h-8 px-3 text-left font-medium">
                      Description
                    </th>
                    <th scope="col" className="label-caps h-8 w-16 px-3 text-right font-medium">
                      Perms
                    </th>
                    <th scope="col" className="label-caps h-8 px-3 text-left font-medium">
                      Permissions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((role) => (
                    <RoleRow key={role.key} role={role} />
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </PageGuard>
    </Card>
  );
}
