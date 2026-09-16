import { PageGuard } from "@/app/(app)/_components/guard";
import { loadNow, loadPortfolioIndex } from "@/app/(app)/_lib/data";
import type { AuditAction } from "@/lib/domain/audit";
import { loadAuditEvents } from "./data";
import { AuditTable } from "./audit-table";

export interface AuditSectionProps {
  action?: AuditAction;
  actorId?: string;
  targetType?: string;
  portfolioId?: string;
  from?: string;
  to?: string;
}

/** Loads the filtered trail and hands plain data to the client table. */
export async function AuditSection(props: AuditSectionProps) {
  const [events, portfolios, now] = await Promise.all([
    loadAuditEvents(props.action, props.actorId, props.targetType, props.portfolioId, props.from, props.to),
    loadPortfolioIndex(),
    loadNow(),
  ]);

  const portfolioCodes: Record<string, string> = {};
  for (const [id, portfolio] of portfolios) portfolioCodes[id] = portfolio.code;

  const filtered = Boolean(props.action || props.actorId || props.targetType || props.portfolioId || props.from || props.to);

  return (
    <PageGuard result={events} what="the audit trail">
      {(paged) => (
        <AuditTable events={paged.items} total={paged.total} now={now} portfolioCodes={portfolioCodes} filtered={filtered} />
      )}
    </PageGuard>
  );
}
