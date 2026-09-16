/**
 * Strategy lifecycle: research → backtested → paper → live → paused → retired.
 *
 * Going live is a capital-allocation decision, so it needs four-eyes approval
 * unless the principal can already override risk (CIO / risk manager). Paper
 * deployment is immediate. Backtests are simulated deterministically; see
 * helpers/backtest-sim.ts for the model and its assumptions.
 */
import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Actor, Principal } from "@/lib/domain/auth";
import { CreateStrategyInput, UpdateStrategyInput, type Strategy, type Backtest } from "@/lib/domain/strategy";
import type { ApprovalRequest } from "@/lib/domain/approval";
import type { Repositories } from "@/lib/repositories/interfaces";
import type { Clock } from "@/lib/core/clock";
import type { IdGenerator } from "@/lib/core/ids";
import { ID_PREFIX } from "@/lib/core/ids";
import type { Logger } from "@/lib/core/logger";
import { ConflictError, InvalidStateError, NotFoundError, ValidationError } from "@/lib/core/errors";
import type { StrategyService, ApprovalService, AuditService } from "./interfaces";
import { ALL_ROWS, PortfolioScope, actorOf, assertDeskVisible, requirePermission, visibleDeskIds } from "./authz";
import { hashSeed, simulateBacktest } from "./helpers/backtest-sim";

type StrategyRepos = Pick<Repositories, "strategies" | "backtests" | "portfolios">;

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export class StrategyServiceImpl implements StrategyService {
  constructor(
    private readonly repos: StrategyRepos,
    private readonly scope: PortfolioScope,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly logger: Logger,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async get(principal: Principal, id: string): Promise<Strategy> {
    requirePermission(principal, "strategies:read");
    const strategy = await this.repos.strategies.findById(id);
    if (!strategy) throw new NotFoundError("Strategy", id);
    assertDeskVisible(principal, strategy.deskId);
    return strategy;
  }

  async list(
    principal: Principal,
    filter: { deskId?: string; status?: Strategy["status"]; portfolioId?: string },
    page: PageQuery,
  ): Promise<Paged<Strategy>> {
    requirePermission(principal, "strategies:read");
    const desks = visibleDeskIds(principal);
    if (filter.deskId && desks !== "all" && !desks.includes(filter.deskId)) {
      return { items: [], total: 0, limit: page.limit, offset: page.offset };
    }
    if (filter.portfolioId) await this.scope.assertVisibleId(principal, filter.portfolioId);
    return this.repos.strategies.list(
      { deskId: filter.deskId, deskIds: desks === "all" ? undefined : desks, status: filter.status, portfolioId: filter.portfolioId },
      page,
    );
  }

  // -------------------------------------------------------------------------
  // Authoring
  // -------------------------------------------------------------------------

  /** Requires strategies:create. New strategies always start in `research`. */
  async create(principal: Principal, input: CreateStrategyInput): Promise<Strategy> {
    requirePermission(principal, "strategies:create");
    const parsed = CreateStrategyInput.safeParse(input);
    if (!parsed.success) throw new ValidationError("Invalid strategy", parsed.error.flatten());
    assertDeskVisible(principal, parsed.data.deskId);
    const existing = await this.repos.strategies.findByCode(parsed.data.code);
    if (existing) throw new ConflictError(`Strategy code '${parsed.data.code}' already exists`, { code: parsed.data.code });

    const now = this.clock.nowIso();
    const strategy = await this.repos.strategies.create({
      ...parsed.data,
      id: this.ids.next(ID_PREFIX.strategy),
      version: 1,
      backtest: null,
      live: null,
      createdAt: now,
      updatedAt: now,
    });
    await this.audit.record({
      action: "strategy.created",
      actor: actorOf(principal),
      targetType: "Strategy",
      targetId: strategy.id,
      portfolioId: null,
      deskId: strategy.deskId,
      summary: `Created strategy ${strategy.code} — ${strategy.name}`,
      data: { style: strategy.style, assetClasses: strategy.assetClasses },
      ip: null,
    });
    return strategy;
  }

  /** Requires strategies:create. Bumps `version` whenever parameters change. */
  async update(principal: Principal, id: string, input: UpdateStrategyInput): Promise<Strategy> {
    requirePermission(principal, "strategies:create");
    const current = await this.get(principal, id);
    const parsed = UpdateStrategyInput.safeParse(input);
    if (!parsed.success) throw new ValidationError("Invalid strategy update", parsed.error.flatten());
    const patch = parsed.data;
    const parametersChanged = patch.parameters !== undefined && JSON.stringify(patch.parameters) !== JSON.stringify(current.parameters);
    const updated = await this.repos.strategies.update(id, {
      ...patch,
      ...(parametersChanged ? { version: current.version + 1 } : {}),
      updatedAt: this.clock.nowIso(),
    });
    await this.audit.record({
      action: "strategy.updated",
      actor: actorOf(principal),
      targetType: "Strategy",
      targetId: id,
      portfolioId: null,
      deskId: updated.deskId,
      summary: `Updated strategy ${updated.code}${parametersChanged ? ` (v${updated.version})` : ""}`,
      data: { changed: Object.keys(patch), parametersChanged },
      ip: null,
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Deployment
  // -------------------------------------------------------------------------

  /**
   * Requires strategies:deploy. Paper deployments apply immediately; live
   * deployments need `orders:override-risk` or a four-eyes approval.
   */
  async deploy(
    principal: Principal,
    id: string,
    portfolioId: string,
    allocatedCapital: number,
    mode: "paper" | "live",
  ): Promise<{ strategy: Strategy; approval: ApprovalRequest | null }> {
    requirePermission(principal, "strategies:deploy");
    const strategy = await this.get(principal, id);
    const portfolio = await this.scope.load(principal, portfolioId);
    if (allocatedCapital <= 0) throw new ValidationError("Allocated capital must be positive");
    if (strategy.status === "retired") throw new InvalidStateError("Retired strategies cannot be deployed");
    if (portfolio.status !== "active") throw new InvalidStateError(`Portfolio is ${portfolio.status}`);
    for (const ac of strategy.assetClasses) {
      if (!portfolio.mandate.assetClasses.includes(ac)) {
        throw new ConflictError(`Strategy trades ${ac}, which is outside the ${portfolio.code} mandate`, { assetClass: ac });
      }
    }

    if (mode === "live" && !principal.permissions.includes("orders:override-risk")) {
      const approval = await this.approvals.request({
        type: "strategy_deploy",
        subjectId: strategy.id,
        subjectLabel: `Deploy ${strategy.code} to ${portfolio.code} (live)`,
        portfolioId: portfolio.id,
        deskId: portfolio.deskId,
        requestedBy: actorOf(principal),
        reason: `Live deployment of ${strategy.name} with ${allocatedCapital.toLocaleString()} ${portfolio.baseCurrency}`,
        riskSummary: `Style ${strategy.style}; asset classes ${strategy.assetClasses.join(", ")}; backtest Sharpe ${strategy.backtest?.sharpe ?? "n/a"}`,
        requiredPermission: "approvals:decide",
        notional: allocatedCapital,
        expiresAt: new Date(this.clock.now().getTime() + APPROVAL_TTL_MS).toISOString(),
      });
      return { strategy, approval };
    }

    const deployed = await this.applyDeployment(strategy, portfolio.id, allocatedCapital, mode);
    await this.audit.record({
      action: "strategy.deployed",
      actor: actorOf(principal),
      targetType: "Strategy",
      targetId: strategy.id,
      portfolioId: portfolio.id,
      deskId: portfolio.deskId,
      summary: `Deployed ${strategy.code} to ${portfolio.code} (${mode})`,
      data: { mode, allocatedCapital, portfolioId: portfolio.id },
      ip: null,
    });
    return { strategy: deployed, approval: null };
  }

  /** Requires strategies:pause. */
  async pause(principal: Principal, id: string, reason: string): Promise<Strategy> {
    requirePermission(principal, "strategies:pause");
    const strategy = await this.get(principal, id);
    if (strategy.status === "paused") return strategy;
    const paused = await this.repos.strategies.update(id, { status: "paused", updatedAt: this.clock.nowIso() });
    await this.audit.record({
      action: "strategy.paused",
      actor: actorOf(principal),
      targetType: "Strategy",
      targetId: id,
      portfolioId: null,
      deskId: strategy.deskId,
      summary: `Paused ${strategy.code}: ${reason}`,
      data: { reason, previousStatus: strategy.status },
      ip: null,
    });
    return paused;
  }

  /** Requires strategies:deploy. Resumes a paused strategy to live when it has deployments, else paper. */
  async resume(principal: Principal, id: string): Promise<Strategy> {
    requirePermission(principal, "strategies:deploy");
    const strategy = await this.get(principal, id);
    if (strategy.status !== "paused") throw new InvalidStateError(`Strategy is ${strategy.status}, not paused`);
    const status: Strategy["status"] = strategy.deployments.length > 0 ? "live" : "paper";
    const resumed = await this.repos.strategies.update(id, { status, updatedAt: this.clock.nowIso() });
    await this.audit.record({
      action: "strategy.deployed",
      actor: actorOf(principal),
      targetType: "Strategy",
      targetId: id,
      portfolioId: null,
      deskId: strategy.deskId,
      summary: `Resumed ${strategy.code} (${status})`,
      data: { status },
      ip: null,
    });
    return resumed;
  }

  // -------------------------------------------------------------------------
  // Research
  // -------------------------------------------------------------------------

  /** Requires research:backtest. Runs synchronously; the simulation is deterministic per (strategy, window, capital). */
  async runBacktest(principal: Principal, id: string, opts: { from: string; to: string; initialCapital: number }): Promise<Backtest> {
    requirePermission(principal, "research:backtest");
    const strategy = await this.get(principal, id);
    if (Date.parse(opts.from) >= Date.parse(opts.to)) throw new ValidationError("Backtest 'from' must precede 'to'");
    if (opts.initialCapital <= 0) throw new ValidationError("Initial capital must be positive");

    const seed = hashSeed(strategy.id, opts.from, opts.to, String(opts.initialCapital), String(strategy.version));
    const { equityCurve, stats } = simulateBacktest({ style: strategy.style, from: opts.from, to: opts.to, initialCapital: opts.initialCapital, seed });
    const now = this.clock.nowIso();
    const backtest = await this.repos.backtests.create({
      id: this.ids.next(ID_PREFIX.backtest),
      strategyId: strategy.id,
      requestedByUserId: principal.userId,
      from: opts.from,
      to: opts.to,
      initialCapital: opts.initialCapital,
      parameters: strategy.parameters,
      status: "completed",
      stats,
      equityCurve,
      summary: `${strategy.name}: ${stats.annualizedReturnPct}% annualised, Sharpe ${stats.sharpe}, max drawdown ${stats.maxDrawdownPct}% over ${equityCurve.length - 1} weeks across ${stats.tradeCount} trades.`,
      createdAt: now,
      updatedAt: now,
    });

    const nextStatus: Strategy["status"] = strategy.status === "research" ? "backtested" : strategy.status;
    await this.repos.strategies.update(strategy.id, { backtest: stats, status: nextStatus, updatedAt: now });
    this.logger.debug("Backtest completed", { strategyId: strategy.id, backtestId: backtest.id, sharpe: stats.sharpe });
    return backtest;
  }

  async listBacktests(principal: Principal, id: string, page: PageQuery): Promise<Paged<Backtest>> {
    await this.get(principal, id);
    return this.repos.backtests.listByStrategy(id, page);
  }

  async getBacktest(principal: Principal, backtestId: string): Promise<Backtest> {
    requirePermission(principal, "research:read");
    const backtest = await this.repos.backtests.findById(backtestId);
    if (!backtest) throw new NotFoundError("Backtest", backtestId);
    await this.get(principal, backtest.strategyId);
    return backtest;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async applyDeployment(strategy: Strategy, portfolioId: string, allocatedCapital: number, mode: "paper" | "live"): Promise<Strategy> {
    const now = this.clock.nowIso();
    const deployments = [
      ...strategy.deployments.filter((d) => d.portfolioId !== portfolioId),
      { portfolioId, allocatedCapital, deployedAt: now },
    ];
    return this.repos.strategies.update(strategy.id, {
      deployments,
      status: mode === "live" ? "live" : "paper",
      updatedAt: now,
    });
  }

  /**
   * Approval outcome handler for `strategy_deploy`, wired up by the
   * composition root (lib/services/index.ts).
   */
  async finalizeDeployment(approval: ApprovalRequest, approved: boolean, decidedBy: Actor, note: string): Promise<void> {
    const strategy = await this.repos.strategies.findById(approval.subjectId);
    if (!strategy) {
      this.logger.warn("Approved deployment for a missing strategy", { strategyId: approval.subjectId });
      return;
    }
    if (!approved || !approval.portfolioId) return;
    await this.applyDeployment(strategy, approval.portfolioId, approval.notional, "live");
    await this.audit.record({
      action: "strategy.deployed",
      actor: decidedBy,
      targetType: "Strategy",
      targetId: strategy.id,
      portfolioId: approval.portfolioId,
      deskId: approval.deskId,
      summary: `Live deployment of ${strategy.code} approved`,
      data: { approvalId: approval.id, allocatedCapital: approval.notional, note },
      ip: null,
    });
  }

  /** All strategies deployed to a portfolio (used by the agent orchestrator). */
  async listDeployedTo(portfolioId: string): Promise<Strategy[]> {
    const page = await this.repos.strategies.list({ portfolioId }, ALL_ROWS);
    return page.items;
  }
}
