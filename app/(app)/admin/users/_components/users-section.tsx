import { PageGuard } from "@/app/(app)/_components/guard";
import { loadDeskIndex, loadNow } from "@/app/(app)/_lib/data";
import { ROLE_CATALOG } from "@/lib/auth/permissions";
import { loadCanManage, loadUsers } from "./data";
import { UsersTable } from "./users-table";

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLE_CATALOG.map((role) => [role.key, role.name]));

/** Loads the directory and hands plain data to the client table. */
export async function UsersSection() {
  const [users, desks, canManage, now] = await Promise.all([loadUsers(), loadDeskIndex(), loadCanManage(), loadNow()]);

  const deskOptions = [...desks.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((desk) => ({ id: desk.id, code: desk.code, name: desk.name }));

  return (
    <PageGuard result={users} what="the user directory">
      {(paged) => (
        <UsersTable
          users={[...paged.items].sort((a, b) => a.name.localeCompare(b.name))}
          desks={deskOptions}
          roleLabels={ROLE_LABELS}
          canManage={canManage}
          now={now}
        />
      )}
    </PageGuard>
  );
}
