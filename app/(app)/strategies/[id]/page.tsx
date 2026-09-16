import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { hasPermission } from "@/lib/auth/permissions";
import { humanize } from "@/lib/ui/format";
import { ActionButton } from "@/app/(app)/_components/action-button";
import { CardSkeleton, DetailSkeleton } from "@/app/(app)/_components/fallbacks";
import { PageGuard } from "@/app/(app)/_components/guard";
import { loadPortfolioIndex, principal } from "@/app/(app)/_lib/data";
import { BacktestDrawer } from "./_components/backtest-drawer";
import { DeployDrawer } from "./_components/deploy-drawer";
import { StrategyOverview } from "./_components/overview";
import { StrategyPerformance } from "./_components/performance";
import { loadStrategy } from "./_components/data";

export const metadata: Metadata = {
  title: "Strategy · Agentic Prop",
  description: "Strategy thesis, parameters, performance, deployments and lifecycle actions.",
};

export const dynamic = "force-dynamic";

export default async function StrategyDetailPage(props: PageProps<"/strategies/[id]">) {
  const { id } = await props.params;
  const [strategy, me, portfolios] = await Promise.all([loadStrategy(id), principal(), loadPortfolioIndex()]);
  if (!strategy.ok && strategy.error.code === "NOT_FOUND") notFound();

  const canBacktest = hasPermission(me, "research:backtest");
  const canDeploy = hasPermission(me, "strategies:deploy");
  const canPause = hasPermission(me, "strategies:pause");
  const portfolioOptions = [...portfolios.values()].map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }));

  return (
    <div className="space-y-4">
      <PageGuard result={strategy} what="this strategy">
        {(s) => (
          <>
            <PageHeader
              title={s.name}
              breadcrumbs={[{ label: "Strategies", href: "/strategies" }, { label: s.code }]}
              description={`${humanize(s.style)} · ${s.assetClasses.map((a) => humanize(a)).join(", ")}`}
              meta={<StatusBadge kind="strategy" value={s.status} size="sm" />}
              actions={
                <>
                  <BacktestDrawer strategyId={s.id} canBacktest={canBacktest} />
                  {s.status === "paused" ? (
                    <ActionButton
                      path={`/api/strategies/${s.id}/resume`}
                      label="Resume"
                      icon={<PlayIcon size={12} />}
                      disabled={!canPause}
                      disabledReason="Requires the strategies:pause permission"
                      confirmTitle="Resume strategy"
                      confirmDescription="The strategy resumes generating signals for its deployed portfolios."
                      confirmLabel="Resume"
                      successTitle="Strategy resumed"
                    />
                  ) : (
                    <ActionButton
                      path={`/api/strategies/${s.id}/pause`}
                      label="Pause"
                      icon={<PauseIcon size={12} />}
                      disabled={!canPause}
                      disabledReason="Requires the strategies:pause permission"
                      reasonKey="reason"
                      reasonLabel="Reason for pausing"
                      reasonPlaceholder="e.g. regime change invalidates the carry assumption"
                      confirmTitle="Pause strategy"
                      confirmDescription="Signal generation stops; existing positions are untouched."
                      confirmLabel="Pause"
                      successTitle="Strategy paused"
                    />
                  )}
                  <DeployDrawer strategyId={s.id} canDeploy={canDeploy} portfolios={portfolioOptions} />
                </>
              }
            />

            <Suspense fallback={<DetailSkeleton lines={5} />}>
              <StrategyOverview strategy={s} />
            </Suspense>

            <Suspense fallback={<CardSkeleton rows={5} cols={7} />}>
              <StrategyPerformance strategyId={s.id} backtest={s.backtest} live={s.live} />
            </Suspense>
          </>
        )}
      </PageGuard>
    </div>
  );
}
