import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { CardSkeleton } from "@/app/(app)/_components/fallbacks";
import { first } from "./_components/data";
import { UsersSection } from "./_components/users-section";
import { RolesTable } from "./_components/roles-table";

export const metadata: Metadata = {
  title: "Users · Agentic Prop",
  description: "Platform directory and the role-based access matrix behind every screen.",
};

export const dynamic = "force-dynamic";

const TABS = [
  { value: "users", label: "Users" },
  { value: "roles", label: "Roles" },
];

export default async function UsersAdminPage(props: PageProps<"/admin/users">) {
  const sp = await props.searchParams;
  const tab = first(sp.tab) === "roles" ? "roles" : "users";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="Who can see and do what. Roles are additive: a user's permissions are the union of every role they hold."
      />

      <Tabs basePath="/admin/users" items={TABS} active={tab} ariaLabel="User administration sections" />

      {tab === "roles" ? (
        <Suspense fallback={<CardSkeleton rows={6} cols={4} />}>
          <RolesTable />
        </Suspense>
      ) : (
        <Suspense fallback={<CardSkeleton rows={8} cols={6} />}>
          <UsersSection />
        </Suspense>
      )}
    </div>
  );
}
