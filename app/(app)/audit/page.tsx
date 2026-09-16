import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { CardSkeleton } from "@/app/(app)/_components/fallbacks";
import { FilterBar } from "@/app/(app)/_components/filters";
import { loadPortfolioIndex } from "@/app/(app)/_lib/data";
import { AuditAction } from "@/lib/domain/audit";
import { ACTION_OPTIONS, TARGET_TYPE_OPTIONS, asEnum, dayToIso, first } from "./_components/format";
import { DateRange } from "./_components/date-range";
import { AuditSection } from "./_components/audit-section";

export const metadata: Metadata = {
  title: "Audit · Agentic Prop",
  description: "Immutable trail of every action taken by humans, agents and the platform itself.",
};

export const dynamic = "force-dynamic";

export default async function AuditPage(props: PageProps<"/audit">) {
  const sp = await props.searchParams;
  const action = asEnum(AuditAction, sp.action);
  const actorId = first(sp.actorId);
  const targetType = first(sp.targetType);
  const portfolioId = first(sp.portfolioId);
  const fromDay = first(sp.from);
  const toDay = first(sp.to);

  const portfolios = await loadPortfolioIndex();
  const portfolioOptions = [...portfolios.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }));

  const params = { action, actorId, targetType, portfolioId };
  const key = [action, actorId, targetType, portfolioId, fromDay, toDay].join("|");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit"
        description="Every order, agent run, risk decision and configuration change, in the order it happened."
        meta={
          <Badge tone="muted" dot>
            Append-only
          </Badge>
        }
      />

      <FilterBar
        basePath="/audit"
        search={{ name: "actorId", value: actorId, label: "Actor id", placeholder: "user or agent id…" }}
        filters={[
          { name: "action", label: "Action", value: action, options: ACTION_OPTIONS, className: "w-56" },
          { name: "targetType", label: "Target type", value: targetType, options: TARGET_TYPE_OPTIONS },
          { name: "portfolioId", label: "Portfolio", value: portfolioId, options: portfolioOptions, className: "w-56" },
        ]}
        preserve={{ from: fromDay, to: toDay }}
        actions={<DateRange basePath="/audit" params={params} from={fromDay} to={toDay} />}
      />

      <Suspense key={key} fallback={<CardSkeleton rows={12} cols={7} />}>
        <AuditSection
          action={action}
          actorId={actorId}
          targetType={targetType}
          portfolioId={portfolioId}
          from={dayToIso(fromDay, "start")}
          to={dayToIso(toDay, "end")}
        />
      </Suspense>
    </div>
  );
}
