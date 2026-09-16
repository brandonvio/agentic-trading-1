import { formatDateTime, formatMoney, formatMultiple, formatPct, humanize } from "@/lib/ui/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailGrid, DetailItem } from "@/app/(app)/_components/detail";
import type { Portfolio } from "@/lib/domain/portfolio";
import type { User } from "@/lib/domain/auth";
import type { Desk } from "@/lib/domain/org";

/** Mandate + ownership. Rendered from the already-loaded portfolio, no extra fetch. */
export function MandatePanel({ portfolio, desk, manager }: { portfolio: Portfolio; desk: Desk | undefined; manager: User | undefined }) {
  const m = portfolio.mandate;
  return (
    <Card>
      <CardHeader>
        <CardTitle hint="what this portfolio is allowed to do">Mandate</CardTitle>
      </CardHeader>
      <CardBody>
        <DetailGrid cols={4}>
          <DetailItem label="Desk" mono={false}>
            {desk ? `${desk.code} · ${desk.name}` : portfolio.deskId}
          </DetailItem>
          <DetailItem label="Manager" mono={false}>
            {manager ? manager.name : portfolio.managerUserId}
          </DetailItem>
          <DetailItem label="Base currency">{portfolio.baseCurrency}</DetailItem>
          <DetailItem label="Inception capital">{formatMoney(portfolio.inceptionCapital, portfolio.baseCurrency, { compact: true })}</DetailItem>

          <DetailItem label="Asset classes" mono={false} className="sm:col-span-2">
            <span className="flex flex-wrap gap-1">
              {m.assetClasses.length === 0 ? (
                <span className="text-fg-subtle">None</span>
              ) : (
                m.assetClasses.map((a) => (
                  <Badge key={a} size="xs" tone="neutral">
                    {humanize(a)}
                  </Badge>
                ))
              )}
            </span>
          </DetailItem>
          <DetailItem label="Max gross leverage">{formatMultiple(m.maxGrossLeverage)}</DetailItem>
          <DetailItem label="Max concentration">{formatPct(m.maxConcentration)}</DetailItem>

          <DetailItem label="Agent trading" mono={false}>
            <Badge size="xs" tone={m.agentTradingEnabled ? "positive" : "muted"} dot>
              {m.agentTradingEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </DetailItem>
          <DetailItem label="Agent approval above">{formatMoney(m.agentApprovalThresholdNotional, portfolio.baseCurrency, { compact: true })}</DetailItem>
          <DetailItem label="NAV as of">{formatDateTime(portfolio.navAsOf)}</DetailItem>
          <DetailItem label="Cash">{formatMoney(portfolio.cash, portfolio.baseCurrency, { compact: true })}</DetailItem>
        </DetailGrid>
      </CardBody>
    </Card>
  );
}
