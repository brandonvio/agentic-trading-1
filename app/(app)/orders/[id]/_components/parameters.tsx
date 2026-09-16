import Link from "next/link";
import { formatDateTime, formatMoney, formatNumber, formatQty, formatSymbol, humanize } from "@/lib/ui/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailGrid, DetailItem, Prose } from "@/app/(app)/_components/detail";
import { loadPortfolioIndex } from "@/app/(app)/_lib/data";
import type { Order } from "@/lib/domain/order";
import { loadInstrument } from "../../_components/data";

const DASH = <span className="text-fg-subtle">—</span>;

/** Order parameters as submitted, plus the venue identifiers it acquired. */
export async function OrderParameters({ order }: { order: Order }) {
  const [portfolios, instrument] = await Promise.all([loadPortfolioIndex(), loadInstrument(order.instrumentId)]);
  const portfolio = portfolios.get(order.portfolioId);

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="as submitted">Parameters</CardTitle>
      </CardHeader>
      <CardBody>
        <DetailGrid cols={4}>
          <DetailItem label="Portfolio" mono={false}>
            {portfolio ? (
              <Link href={`/portfolios/${order.portfolioId}`} className="text-accent-strong hover:underline">
                <span className="num">{portfolio.code}</span> · {portfolio.name}
              </Link>
            ) : (
              <span className="num">{order.portfolioId}</span>
            )}
          </DetailItem>
          <DetailItem label="Instrument">
            {formatSymbol(order.symbol)}
            {instrument.ok ? <span className="ml-1.5 font-sans text-fg-subtle">{instrument.value.name}</span> : null}
          </DetailItem>
          <DetailItem label="Asset class" mono={false}>
            {humanize(order.assetClass)}
          </DetailItem>
          <DetailItem label="Broker" mono={false}>
            {order.broker.toUpperCase()}
          </DetailItem>

          <DetailItem label="Side">{order.side}</DetailItem>
          <DetailItem label="Type">{order.type.replace("_", " ")}</DetailItem>
          <DetailItem label="Time in force">{order.timeInForce}</DetailItem>
          <DetailItem label="Origin" mono={false}>
            <Badge tone={order.origin === "manual" ? "muted" : order.origin === "agent" ? "accent" : "info"} size="xs" dot={false}>
              {humanize(order.origin)}
            </Badge>
          </DetailItem>

          <DetailItem label="Quantity">{formatQty(order.quantity)}</DetailItem>
          <DetailItem label="Filled quantity">{formatQty(order.filledQuantity)}</DetailItem>
          <DetailItem label="Limit price">{order.limitPrice === null ? DASH : formatNumber(order.limitPrice, { decimals: 2 })}</DetailItem>
          <DetailItem label="Stop price">{order.stopPrice === null ? DASH : formatNumber(order.stopPrice, { decimals: 2 })}</DetailItem>

          <DetailItem label="Average fill">{order.averageFillPrice === null ? DASH : formatNumber(order.averageFillPrice, { decimals: 4 })}</DetailItem>
          <DetailItem label="Estimated notional">{formatMoney(order.estimatedNotional, "USD")}</DetailItem>
          <DetailItem label="Created by" mono={false}>
            {order.createdBy.name} <span className="text-fg-subtle">({order.createdBy.kind})</span>
          </DetailItem>
          <DetailItem label="Broker account">{order.brokerAccountId}</DetailItem>

          <DetailItem label="Created">{formatDateTime(order.createdAt, { seconds: true })}</DetailItem>
          <DetailItem label="Submitted">{order.submittedAt ? formatDateTime(order.submittedAt, { seconds: true }) : DASH}</DetailItem>
          <DetailItem label="Completed">{order.completedAt ? formatDateTime(order.completedAt, { seconds: true }) : DASH}</DetailItem>
          <DetailItem label="External order id">{order.externalOrderId ?? DASH}</DetailItem>
        </DetailGrid>

        {order.rationale ? (
          <div className="mt-4 border-t border-edge pt-3">
            <p className="label-caps mb-1">Rationale</p>
            <Prose>{order.rationale}</Prose>
          </div>
        ) : null}

        {order.rejectionReason ? (
          <p role="alert" className="mt-3 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
            {order.rejectionReason}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
