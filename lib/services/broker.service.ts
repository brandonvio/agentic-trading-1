import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Principal } from "@/lib/domain/auth";
import type { BrokerKey } from "@/lib/domain/instrument";
import type { BrokerAccount } from "@/lib/domain/portfolio";
import type { BrokerAccountRepository } from "@/lib/repositories/interfaces";
import type { BrokerRegistry, BrokerCapabilities, BrokerHealth } from "@/lib/brokers/types";
import type { Clock } from "@/lib/core/clock";
import { NotFoundError } from "@/lib/core/errors";
import type { BrokerService, AuditService } from "./interfaces";
import { ALL_ROWS, PortfolioScope, actorOf, requirePermission } from "./authz";

/** Broker connectivity and account reconciliation. */
export class BrokerServiceImpl implements BrokerService {
  constructor(
    private readonly accounts: BrokerAccountRepository,
    private readonly brokers: BrokerRegistry,
    private readonly scope: PortfolioScope,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** Requires brokers:read. Capabilities + live health per adapter, with the count of visible accounts at that broker. */
  async listBrokers(principal: Principal): Promise<Array<{ capabilities: BrokerCapabilities; health: BrokerHealth; accountCount: number }>> {
    requirePermission(principal, "brokers:read");
    const scoped = await this.scope.filter(principal);
    const visible = new Set(scoped.portfolioIds);
    const out: Array<{ capabilities: BrokerCapabilities; health: BrokerHealth; accountCount: number }> = [];
    for (const adapter of this.brokers.all()) {
      const accounts = (await this.accounts.list({ broker: adapter.key }, ALL_ROWS)).items.filter((a) => !scoped.portfolioIds || visible.has(a.portfolioId));
      out.push({ capabilities: adapter.capabilities(), health: await adapter.health(), accountCount: accounts.length });
    }
    return out;
  }

  /** Requires brokers:read. Scoped to visible portfolios. */
  async listAccounts(principal: Principal, filter: { portfolioId?: string; broker?: BrokerKey }, page: PageQuery): Promise<Paged<BrokerAccount>> {
    requirePermission(principal, "brokers:read");
    const scoped = await this.scope.filter(principal, filter.portfolioId);
    if (scoped.portfolioIds) {
      const visible = new Set(scoped.portfolioIds);
      const all = (await this.accounts.list({ broker: filter.broker }, ALL_ROWS)).items.filter((a) => visible.has(a.portfolioId));
      return { items: all.slice(page.offset, page.offset + page.limit), total: all.length, limit: page.limit, offset: page.offset };
    }
    return this.accounts.list({ portfolioId: scoped.portfolioId, broker: filter.broker }, page);
  }

  /** Requires brokers:read and portfolio visibility. */
  async getAccount(principal: Principal, id: string): Promise<BrokerAccount> {
    requirePermission(principal, "brokers:read");
    const account = await this.accounts.findById(id);
    if (!account) throw new NotFoundError("BrokerAccount", id);
    await this.scope.assertVisibleId(principal, account.portfolioId);
    return account;
  }

  /** Requires brokers:manage. Pulls the broker snapshot and stores balances + heartbeat. */
  async reconcileAccount(principal: Principal, id: string): Promise<BrokerAccount> {
    requirePermission(principal, "brokers:manage");
    const account = await this.getAccount(principal, id);
    const snapshot = await this.brokers.get(account.broker).getAccountSnapshot(account);
    const now = this.clock.nowIso();
    return this.accounts.update(id, {
      externalAccountId: snapshot.externalAccountId || account.externalAccountId,
      cashBalance: snapshot.cashBalance,
      buyingPower: snapshot.buyingPower,
      marginUsed: snapshot.marginUsed,
      lastHeartbeatAt: now,
      updatedAt: now,
    });
  }

  /** Requires brokers:manage. Audits broker.connected (connected/paper) or broker.disconnected (degraded/disconnected). */
  async setAccountStatus(principal: Principal, id: string, status: BrokerAccount["status"]): Promise<BrokerAccount> {
    requirePermission(principal, "brokers:manage");
    const account = await this.getAccount(principal, id);
    const now = this.clock.nowIso();
    const updated = await this.accounts.update(id, { status, updatedAt: now, lastHeartbeatAt: status === "disconnected" ? account.lastHeartbeatAt : now });
    const connected = status === "connected" || status === "paper";
    await this.audit.record({
      action: connected ? "broker.connected" : "broker.disconnected",
      actor: actorOf(principal),
      targetType: "BrokerAccount",
      targetId: id,
      portfolioId: account.portfolioId,
      deskId: null,
      summary: `${account.label} (${account.broker}) set to ${status}`,
      data: { from: account.status, to: status },
      ip: null,
    });
    return updated;
  }
}
