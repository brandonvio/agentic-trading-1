/**
 * SignalService: the queue of trade ideas produced by agents and strategies.
 * Reading is gated on `agents:read`; turning a signal into an order is gated
 * on `orders:create` and goes through the normal order pipeline, so a signal
 * never bypasses pre-trade risk or approvals.
 */
import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Principal } from "@/lib/domain/auth";
import type { Order } from "@/lib/domain/order";
import type { Signal, SignalStatus } from "@/lib/domain/agent";
import type { Repositories } from "@/lib/repositories/interfaces";
import type { Clock } from "@/lib/core/clock";
import type { Logger } from "@/lib/core/logger";
import { InvalidStateError, NotFoundError, ValidationError } from "@/lib/core/errors";
import type { SignalService } from "@/lib/services/interfaces";
import { PortfolioScope, actorOf, requireAnyPermission, requirePermission } from "@/lib/services/authz";
import type { ServicesAccessor } from "./services";

export class SignalServiceImpl implements SignalService {
  constructor(
    private readonly repos: Repositories,
    private readonly scope: PortfolioScope,
    private readonly services: ServicesAccessor,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Requires agents:read plus visibility of the signal's portfolio. */
  async get(principal: Principal, id: string): Promise<Signal> {
    requirePermission(principal, "agents:read");
    const signal = await this.repos.signals.findById(id);
    if (!signal) throw new NotFoundError("Signal", id);
    if (signal.portfolioId) await this.scope.assertVisibleId(principal, signal.portfolioId);
    return signal;
  }

  /** Requires agents:read. Newest first, restricted to visible portfolios. */
  async list(
    principal: Principal,
    filter: { portfolioId?: string; strategyId?: string; agentId?: string; status?: SignalStatus; instrumentId?: string },
    page: PageQuery,
  ): Promise<Paged<Signal>> {
    requirePermission(principal, "agents:read");
    const scoped = await this.scope.filter(principal, filter.portfolioId);
    return this.repos.signals.list(
      { strategyId: filter.strategyId, agentId: filter.agentId, status: filter.status, instrumentId: filter.instrumentId, ...scoped },
      page,
    );
  }

  /**
   * Requires orders:create. Submits the signal as an order (origin `agent`
   * when the signal came from an agent, otherwise `strategy`), links the order
   * back to the signal and marks the signal `acted`.
   */
  async act(
    principal: Principal,
    id: string,
    overrides: { quantity?: number; type?: Order["type"]; limitPrice?: number } = {},
  ): Promise<Order> {
    requirePermission(principal, "orders:create");
    const signal = await this.get(principal, id);
    if (signal.status !== "new") throw new InvalidStateError(`Signal '${id}' is ${signal.status} and can no longer be acted on`, { status: signal.status });
    if (!signal.portfolioId) throw new ValidationError("Signal has no portfolio scope and cannot be traded");
    if (signal.expiresAt <= this.clock.nowIso()) throw new InvalidStateError(`Signal '${id}' expired at ${signal.expiresAt}`, { expiresAt: signal.expiresAt });

    const side = signal.side ?? sideFor(signal.direction);
    if (!side) throw new ValidationError(`Signal '${id}' is ${signal.direction} without an explicit side; specify the side before trading it`);
    const quantity = overrides.quantity ?? signal.suggestedQuantity;
    if (!(quantity > 0)) throw new ValidationError("Signal has no positive quantity to trade");

    const type = overrides.type ?? "MARKET";
    const order = await this.services().orders.submit(
      principal,
      {
        portfolioId: signal.portfolioId,
        instrumentId: signal.instrumentId,
        side,
        type,
        quantity,
        limitPrice: overrides.limitPrice ?? (type === "LIMIT" || type === "STOP_LIMIT" ? (signal.entryPrice ?? undefined) : undefined),
        timeInForce: "DAY",
        rationale: `Acting on signal ${signal.id} (${signal.direction} ${signal.symbol}, conviction ${signal.conviction}): ${signal.thesis}`,
        strategyId: signal.strategyId ?? undefined,
        signalId: signal.id,
        agentRunId: signal.runId ?? undefined,
        origin: signal.agentId ? "agent" : "strategy",
      },
      actorOf(principal),
    );
    await this.repos.signals.update(signal.id, { status: "acted" });
    return order;
  }

  /**
   * Requires any of agents:configure, agents:run or orders:create — the same
   * gate the route applies, so desk users who can act on a signal can also
   * clear it. The signal stays in place with status `dismissed` and the reason
   * is recorded as an audit event.
   */
  async dismiss(principal: Principal, id: string, reason: string): Promise<Signal> {
    // Matches the route gate: desk users who act on signals may also clear them.
    requireAnyPermission(principal, ["agents:configure", "agents:run", "orders:create"]);
    const signal = await this.get(principal, id);
    if (signal.status !== "new") throw new InvalidStateError(`Signal '${id}' is already ${signal.status}`, { status: signal.status });
    if (!reason.trim()) throw new ValidationError("A dismissal reason is required");
    this.logger.info("signal dismissed", { signalId: id, portfolioId: signal.portfolioId, by: principal.userId, reason });
    const dismissed = await this.repos.signals.update(id, { status: "dismissed" });
    await this.services().audit.record({
      action: "signal.dismissed",
      actor: actorOf(principal),
      targetType: "Signal",
      targetId: id,
      portfolioId: signal.portfolioId,
      deskId: null,
      summary: `Dismissed ${signal.direction} signal on ${signal.symbol}: ${reason}`,
      data: { reason, conviction: signal.conviction, agentId: signal.agentId, strategyId: signal.strategyId },
      ip: null,
    });
    return dismissed;
  }
}

function sideFor(direction: Signal["direction"]): Order["side"] | null {
  if (direction === "LONG") return "BUY";
  if (direction === "SHORT") return "SELL";
  return null;
}
