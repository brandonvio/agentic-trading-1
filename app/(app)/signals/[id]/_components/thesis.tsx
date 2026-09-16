import Link from "next/link";
import { formatDateTime, formatMoney, formatNumber, formatPct, formatQty, humanize } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { StatusBadge, TONE_TEXT } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { DetailGrid, DetailItem, Prose } from "@/app/(app)/_components/detail";
import { loadPortfolioIndex } from "@/app/(app)/_lib/data";
import type { Signal } from "@/lib/domain/agent";

const DASH = <span className="text-fg-subtle">—</span>;

function horizonLabel(hours: number): string {
  if (hours >= 24 * 7) return `${formatNumber(hours / (24 * 7), { decimals: 1 })} weeks`;
  if (hours >= 24) return `${formatNumber(hours / 24, { decimals: 1 })} days`;
  return `${formatNumber(hours, { decimals: 0 })} hours`;
}

/** The written thesis plus every quantified parameter of the idea. */
export async function SignalThesis({ signal }: { signal: Signal }) {
  const portfolios = await loadPortfolioIndex();
  const portfolio = signal.portfolioId ? portfolios.get(signal.portfolioId) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="agent reasoning">Thesis</CardTitle>
        <StatusBadge kind="signal" value={signal.status} size="xs" />
      </CardHeader>
      <CardBody>
        <Prose className="text-fg">{signal.thesis || "No written thesis was attached to this signal."}</Prose>

        <div className="mt-4 border-t border-edge pt-4">
          <DetailGrid cols={4}>
            <DetailItem label="Conviction" mono={false}>
              <ProgressBar value={signal.conviction} tone="accent" size="sm" warnAt={0} showValue />
            </DetailItem>
            <DetailItem label="Expected return">
              <span className={TONE_TEXT[toneForSign(signal.expectedReturnPct)]}>{formatPct(signal.expectedReturnPct, { sign: true })}</span>
            </DetailItem>
            <DetailItem label="Horizon" mono={false}>
              {horizonLabel(signal.horizonHours)}
            </DetailItem>
            <DetailItem label="Direction" mono={false}>
              <StatusBadge kind="direction" value={signal.direction} size="xs" dot={false} />
              {signal.side ? <span className="num ml-2 text-fg-muted">{signal.side}</span> : null}
            </DetailItem>

            <DetailItem label="Suggested notional">{formatMoney(signal.suggestedNotional, "USD", { compact: true })}</DetailItem>
            <DetailItem label="Suggested quantity">{formatQty(signal.suggestedQuantity)}</DetailItem>
            <DetailItem label="Asset class" mono={false}>
              {humanize(signal.assetClass)}
            </DetailItem>
            <DetailItem label="Portfolio" mono={false}>
              {portfolio ? (
                <Link href={`/portfolios/${portfolio.id}`} className="text-accent-strong hover:underline">
                  <span className="num">{portfolio.code}</span> · {portfolio.name}
                </Link>
              ) : (
                DASH
              )}
            </DetailItem>

            <DetailItem label="Entry">{signal.entryPrice === null ? DASH : formatNumber(signal.entryPrice, { decimals: 4 })}</DetailItem>
            <DetailItem label="Stop">{signal.stopPrice === null ? DASH : formatNumber(signal.stopPrice, { decimals: 4 })}</DetailItem>
            <DetailItem label="Target">{signal.targetPrice === null ? DASH : formatNumber(signal.targetPrice, { decimals: 4 })}</DetailItem>
            <DetailItem label="Created">{formatDateTime(signal.createdAt, { seconds: true })}</DetailItem>
            <DetailItem label="Expires">{formatDateTime(signal.expiresAt, { seconds: true })}</DetailItem>
          </DetailGrid>
        </div>
      </CardBody>
    </Card>
  );
}
