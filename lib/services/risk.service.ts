import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Actor, Principal } from "@/lib/domain/auth";
import type { Portfolio } from "@/lib/domain/portfolio";
import type { Order, RiskCheckResult } from "@/lib/domain/order";
import { CreateRiskLimitInput, UpdateRiskLimitInput, type RiskLimit, type RiskBreach, type RiskReport, type RiskBreachStatus, type RiskMetric, type RiskLimitScope } from "@/lib/domain/risk";
import type { Repositories } from "@/lib/repositories/interfaces";
import type { Clock } from "@/lib/core/clock";
import type { IdGenerator } from "@/lib/core/ids";
import { ID_PREFIX } from "@/lib/core/ids";
import type { Logger } from "@/lib/core/logger";
import { InvalidStateError, NotFoundError, ValidationError } from "@/lib/core/errors";
import type { RiskService, PreTradeCheckContext, PreTradeDecision, AuditService } from "./interfaces";
import { ALL_ROWS, PortfolioScope, actorOf, requirePermission } from "./authz";
import { startOfUtcDayIso } from "./helpers/time";
import { computeSnapshot } from "./helpers/portfolio-math";
import { computeMetric, evaluateLimit, formatMetric, projectOrder, type RiskState, type LimitEvaluation } from "./helpers/risk-metrics";

type RiskRepos = Pick<Repositories, "portfolios" | "positions" | "orders" | "brokerAccounts" | "riskLimits" | "riskBreaches">;

const OPEN_ORDER_STATUSES: Order["status"][] = ["PENDING_RISK", "PENDING_APPROVAL", "ROUTED", "ACKNOWLEDGED", "PARTIALLY_FILLED"];

type Outcome = PreTradeDecision["outcome"];
const OUTCOME_RANK: Record<Outcome, number> = { pass: 0, warn: 1, require_approval: 2, block: 3 };

interface Finding {
  check: RiskCheckResult;
  outcome: Outcome;
  /** Present when the finding should be recorded as a breach on block. */
  breach?: { limitId: string; limitName: string; metric: RiskMetric; scope: RiskLimitScope; scopeId: string | null; observed: number; threshold: number };
}

/**
 * Risk engine: limit evaluation for reports/scans, pre-trade checks for the
 * OMS, and limit/breach administration. See helpers/risk-metrics.ts for the
 * metric model and its assumptions.
 */
export class RiskServiceImpl implements RiskService {
  constructor(
    private readonly repos: RiskRepos,
    private readonly scope: PortfolioScope,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly logger: Logger,
  ) {}

  /** Requires risk:read and portfolio visibility. Per-limit observed value, utilisation and status. */
  async report(principal: Principal, portfolioId: string): Promise<RiskReport> {
    requirePermission(principal, "risk:read");
    const portfolio = await this.scope.load(principal, portfolioId);
    return this.reportFor(portfolio);
  }

  /** Requires risk:read. Reports for every visible portfolio plus open/critical breach counts. */
  async firmReport(principal: Principal): Promise<{ asOf: string; portfolios: RiskReport[]; openBreaches: number; criticalBreaches: number }> {
    requirePermission(principal, "risk:read");
    const portfolios = await this.scope.visiblePortfolios(principal);
    const reports: RiskReport[] = [];
    for (const p of portfolios) reports.push(await this.reportFor(p));
    const scoped = await this.scope.filter(principal);
    const open = await this.repos.riskBreaches.list({ ...scoped, status: "open" }, ALL_ROWS);
    return {
      asOf: this.clock.nowIso(),
      portfolios: reports,
      openBreaches: open.total,
      criticalBreaches: open.items.filter((b) => b.severity === "critical").length,
    };
  }

  /**
   * Evaluate a prospective order against applicable limits, the portfolio
   * mandate, portfolio status and (for agents) autonomy/mandate thresholds.
   * Blocking findings are recorded as critical RiskBreaches.
   */
  async preTradeCheck(ctx: PreTradeCheckContext): Promise<PreTradeDecision> {
    const { order, portfolio, instrument } = ctx;
    const agent = ctx.agent ?? null;
    const isAgent = ctx.actor.kind === "agent" || agent !== null;
    const base = await this.stateFor(portfolio);
    const projected = projectOrder(base, order);
    const findings: Finding[] = [];

    // Portfolio status
    findings.push(this.finding("portfolio:status", portfolio.status === "active", portfolio.status === "active" ? "Portfolio is active" : `Portfolio is ${portfolio.status}; no new orders`, null, null, "block", {
      limitId: "portfolio-status",
      limitName: "Portfolio status",
      metric: "order_notional",
      scope: "portfolio",
      scopeId: portfolio.id,
      observed: order.estimatedNotional,
      threshold: 0,
    }));

    // Mandate
    const m = portfolio.mandate;
    const assetOk = m.assetClasses.includes(instrument.assetClass);
    findings.push(this.finding("mandate:asset_class", assetOk, assetOk ? `${instrument.assetClass} permitted by mandate` : `${instrument.assetClass} is outside the portfolio mandate`, null, null, "block", {
      limitId: "mandate-asset-class",
      limitName: "Mandate asset classes",
      metric: "asset_class_pct_nav",
      scope: "portfolio",
      scopeId: portfolio.id,
      observed: 1,
      threshold: 0,
    }));
    const leverage = computeMetric("gross_exposure_pct_nav", null, projected);
    findings.push(this.finding("mandate:max_gross_leverage", leverage <= m.maxGrossLeverage, `Post-trade gross leverage ${leverage.toFixed(2)}x vs mandate ${m.maxGrossLeverage}x`, leverage, m.maxGrossLeverage, "block", {
      limitId: "mandate-gross-leverage",
      limitName: "Mandate max gross leverage",
      metric: "gross_exposure_pct_nav",
      scope: "portfolio",
      scopeId: portfolio.id,
      observed: leverage,
      threshold: m.maxGrossLeverage,
    }));
    const concentration = computeMetric("single_instrument_pct_nav", instrument.id, projected);
    findings.push(this.finding("mandate:max_concentration", concentration <= m.maxConcentration, `Post-trade ${instrument.symbol} concentration ${(concentration * 100).toFixed(1)}% vs mandate ${(m.maxConcentration * 100).toFixed(1)}%`, concentration, m.maxConcentration, "block", {
      limitId: "mandate-concentration",
      limitName: "Mandate max concentration",
      metric: "single_instrument_pct_nav",
      scope: "portfolio",
      scopeId: portfolio.id,
      observed: concentration,
      threshold: m.maxConcentration,
    }));

    // Agent policy
    if (isAgent) {
      const autonomy = agent?.autonomy ?? "supervised";
      if (autonomy === "advisory") findings.push(this.finding("agent:autonomy", false, "Advisory agents may not submit orders", null, null, "block", this.agentBreach(agent, portfolio, order, "Agent autonomy")));
      else if (autonomy === "supervised")
        // Not a pass/fail check but a routing policy: the order is well-formed
        // yet may never reach the venue without a human decision, so the
        // outcome is set explicitly rather than through `finding()`.
        findings.push({
          check: { rule: "agent:autonomy", passed: false, message: "Supervised agent: human approval required", observed: null, limit: null },
          outcome: "require_approval",
        });
      else findings.push(this.finding("agent:autonomy", true, "Autonomous agent within mandate", null, null, "pass"));

      findings.push(
        this.finding("agent:trading_enabled", m.agentTradingEnabled, m.agentTradingEnabled ? "Agent trading enabled for portfolio" : "Agent trading is disabled for this portfolio", null, null, "block", this.agentBreach(agent, portfolio, order, "Agent trading disabled")),
      );
      const overThreshold = order.estimatedNotional > m.agentApprovalThresholdNotional;
      findings.push(
        this.finding(
          "agent:approval_threshold",
          !overThreshold,
          overThreshold ? `Notional ${formatMetric("order_notional", order.estimatedNotional)} exceeds agent approval threshold ${formatMetric("order_notional", m.agentApprovalThresholdNotional)}` : "Notional within agent approval threshold",
          order.estimatedNotional,
          m.agentApprovalThresholdNotional,
          "require_approval",
        ),
      );
    }

    // Configured limits
    const limits = await this.repos.riskLimits.listApplicable({ portfolioId: portfolio.id, deskId: portfolio.deskId, strategyId: order.strategyId, agentId: agent?.id ?? null });
    for (const limit of limits) {
      const ev = evaluateLimit(limit, computeMetric(limit.metric, limit.qualifier, projected));
      findings.push(this.limitFinding(ev, portfolio));
    }

    const outcome = findings.reduce<Outcome>((worst, f) => (OUTCOME_RANK[f.outcome] > OUTCOME_RANK[worst] ? f.outcome : worst), "pass");
    const reasons = findings.filter((f) => f.outcome !== "pass").map((f) => f.check.message);

    if (outcome === "block") {
      for (const f of findings) {
        if (f.outcome !== "block" || !f.breach) continue;
        await this.recordBreach({ ...f.breach, portfolioId: portfolio.id, severity: "critical", message: f.check.message, actionTaken: `blocked order ${order.id}`, detectedBy: ctx.actor });
      }
    }
    return { outcome, checks: findings.map((f) => f.check), reasons };
  }

  /** Evaluate current state against applicable limits and record breaches not already open for the same limit + portfolio. */
  async scanPortfolio(portfolioId: string, detectedBy: Actor): Promise<RiskBreach[]> {
    const portfolio = await this.repos.portfolios.findById(portfolioId);
    if (!portfolio) throw new NotFoundError("Portfolio", portfolioId);
    const state = await this.stateFor(portfolio);
    const limits = await this.repos.riskLimits.listApplicable({ portfolioId, deskId: portfolio.deskId });
    const existing = (await this.repos.riskBreaches.list({ portfolioId }, ALL_ROWS)).items.filter((b) => b.status !== "resolved");
    const created: RiskBreach[] = [];
    for (const limit of limits) {
      const ev = evaluateLimit(limit, computeMetric(limit.metric, limit.qualifier, state));
      if (ev.status !== "breached") continue;
      if (existing.some((b) => b.limitId === limit.id)) continue;
      const critical = limit.action === "block" || limit.action === "auto_unwind";
      created.push(
        await this.recordBreach({
          limitId: limit.id,
          limitName: limit.name,
          metric: limit.metric,
          scope: limit.scope,
          scopeId: limit.scopeId,
          portfolioId,
          observed: ev.observed,
          threshold: ev.threshold,
          severity: critical ? "critical" : "warning",
          message: `${limit.name}: ${formatMetric(limit.metric, ev.observed)} exceeds ${formatMetric(limit.metric, ev.threshold)}`,
          actionTaken: `flagged by scan (limit action: ${limit.action})`,
          detectedBy,
        }),
      );
    }
    return created;
  }

  /** Requires risk:read. */
  async listLimits(principal: Principal, filter: { scope?: RiskLimit["scope"]; scopeId?: string }, page: PageQuery): Promise<Paged<RiskLimit>> {
    requirePermission(principal, "risk:read");
    return this.repos.riskLimits.list(filter, page);
  }

  /** Requires risk:limits:write. Audits risk.limit_created. */
  async createLimit(principal: Principal, input: CreateRiskLimitInput): Promise<RiskLimit> {
    requirePermission(principal, "risk:limits:write");
    const parsed = CreateRiskLimitInput.safeParse(input);
    if (!parsed.success) throw new ValidationError("Invalid risk limit", parsed.error.flatten());
    if (parsed.data.scope !== "platform" && !parsed.data.scopeId) throw new ValidationError("scopeId is required for non-platform limits");
    const now = this.clock.nowIso();
    const limit = await this.repos.riskLimits.create({ ...parsed.data, id: this.ids.next(ID_PREFIX.riskLimit), createdByUserId: principal.userId, createdAt: now, updatedAt: now });
    await this.audit.record({
      action: "risk.limit_created",
      actor: actorOf(principal),
      targetType: "RiskLimit",
      targetId: limit.id,
      portfolioId: limit.scope === "portfolio" ? limit.scopeId : null,
      deskId: limit.scope === "desk" ? limit.scopeId : null,
      summary: `Created limit ${limit.name} (${limit.metric} ≤ ${limit.threshold}, ${limit.action})`,
      data: { metric: limit.metric, threshold: limit.threshold, action: limit.action, scope: limit.scope, scopeId: limit.scopeId },
      ip: null,
    });
    return limit;
  }

  /** Requires risk:limits:write. Audits risk.limit_updated. */
  async updateLimit(principal: Principal, id: string, input: UpdateRiskLimitInput): Promise<RiskLimit> {
    requirePermission(principal, "risk:limits:write");
    const parsed = UpdateRiskLimitInput.safeParse(input);
    if (!parsed.success) throw new ValidationError("Invalid risk limit update", parsed.error.flatten());
    const existing = await this.repos.riskLimits.findById(id);
    if (!existing) throw new NotFoundError("RiskLimit", id);
    const updated = await this.repos.riskLimits.update(id, { ...parsed.data, updatedAt: this.clock.nowIso() });
    await this.audit.record({
      action: "risk.limit_updated",
      actor: actorOf(principal),
      targetType: "RiskLimit",
      targetId: id,
      portfolioId: updated.scope === "portfolio" ? updated.scopeId : null,
      deskId: updated.scope === "desk" ? updated.scopeId : null,
      summary: `Updated limit ${updated.name}`,
      data: { changed: Object.keys(parsed.data), before: { threshold: existing.threshold, action: existing.action, enabled: existing.enabled } },
      ip: null,
    });
    return updated;
  }

  /** Requires risk:limits:write. Audits as risk.limit_updated with `deleted: true`. */
  async deleteLimit(principal: Principal, id: string): Promise<void> {
    requirePermission(principal, "risk:limits:write");
    const existing = await this.repos.riskLimits.findById(id);
    if (!existing) throw new NotFoundError("RiskLimit", id);
    await this.repos.riskLimits.delete(id);
    await this.audit.record({
      action: "risk.limit_updated",
      actor: actorOf(principal),
      targetType: "RiskLimit",
      targetId: id,
      portfolioId: existing.scope === "portfolio" ? existing.scopeId : null,
      deskId: existing.scope === "desk" ? existing.scopeId : null,
      summary: `Deleted limit ${existing.name}`,
      data: { deleted: true, metric: existing.metric, threshold: existing.threshold },
      ip: null,
    });
  }

  /** Requires risk:read. Scoped to visible portfolios (platform breaches without a portfolio are only visible to global roles). */
  async listBreaches(principal: Principal, filter: { portfolioId?: string; status?: RiskBreachStatus; severity?: RiskBreach["severity"] }, page: PageQuery): Promise<Paged<RiskBreach>> {
    requirePermission(principal, "risk:read");
    const scoped = await this.scope.filter(principal, filter.portfolioId);
    return this.repos.riskBreaches.list({ ...filter, ...scoped }, page);
  }

  /**
   * Requires risk:read. open → acknowledged.
   *
   * Acknowledging only records that someone with visibility of the breach has
   * seen it, so anyone who can read risk (a PM on the desk, say) may do it.
   * Declaring a breach *resolved* is the restricted action.
   */
  async acknowledgeBreach(principal: Principal, id: string): Promise<RiskBreach> {
    requirePermission(principal, "risk:read");
    const breach = await this.loadBreach(principal, id);
    if (breach.status !== "open") throw new InvalidStateError(`Breach is ${breach.status}; only open breaches can be acknowledged`);
    return this.repos.riskBreaches.update(id, { status: "acknowledged", acknowledgedByUserId: principal.userId });
  }

  /** Requires risk:breaches:resolve. Audits risk.breach_resolved. */
  async resolveBreach(principal: Principal, id: string, note: string): Promise<RiskBreach> {
    requirePermission(principal, "risk:breaches:resolve");
    const breach = await this.loadBreach(principal, id);
    if (breach.status === "resolved") throw new InvalidStateError("Breach is already resolved");
    const now = this.clock.nowIso();
    const updated = await this.repos.riskBreaches.update(id, { status: "resolved", resolvedByUserId: principal.userId, resolvedAt: now, resolutionNote: note });
    await this.audit.record({
      action: "risk.breach_resolved",
      actor: actorOf(principal),
      targetType: "RiskBreach",
      targetId: id,
      portfolioId: breach.portfolioId,
      deskId: null,
      summary: `Resolved breach of ${breach.limitName}: ${note}`,
      data: { limitId: breach.limitId, metric: breach.metric, note },
      ip: null,
    });
    return updated;
  }

  // -------------------------------------------------------------------------

  private async loadBreach(principal: Principal, id: string): Promise<RiskBreach> {
    const breach = await this.repos.riskBreaches.findById(id);
    if (!breach) throw new NotFoundError("RiskBreach", id);
    if (breach.portfolioId) await this.scope.assertVisibleId(principal, breach.portfolioId);
    return breach;
  }

  private async reportFor(portfolio: Portfolio): Promise<RiskReport> {
    const state = await this.stateFor(portfolio);
    const limits = await this.repos.riskLimits.listApplicable({ portfolioId: portfolio.id, deskId: portfolio.deskId });
    const top = state.exposures.reduce<RiskState["exposures"][number] | null>((b, e) => (!b || Math.abs(e.marketValue) > Math.abs(b.marketValue) ? e : b), null);
    return {
      portfolioId: portfolio.id,
      asOf: this.clock.nowIso(),
      nav: state.nav,
      grossExposurePctNav: computeMetric("gross_exposure_pct_nav", null, state),
      netExposurePctNav: computeMetric("net_exposure_pct_nav", null, state),
      var95PctNav: computeMetric("var_95_pct_nav", null, state),
      dailyLossPctNav: computeMetric("daily_loss_pct_nav", null, state),
      drawdownPct: computeMetric("drawdown_pct", null, state),
      marginUtilizationPct: computeMetric("margin_utilization_pct", null, state),
      largestPosition: top && state.nav > 0 ? { symbol: top.symbol, pctNav: Math.abs(top.marketValue) / state.nav } : null,
      limits: limits.map((limit) => {
        const ev = evaluateLimit(limit, computeMetric(limit.metric, limit.qualifier, state));
        return { limit, observed: ev.observed, utilizationPct: ev.utilizationPct, status: ev.status };
      }),
    };
  }

  /** Build the metric input state from repositories. Order notional is 0 until projected. */
  private async stateFor(portfolio: Portfolio): Promise<RiskState> {
    const now = this.clock.now();
    const startOfDay = startOfUtcDayIso(now);
    const positions = (await this.repos.positions.list({ portfolioId: portfolio.id }, ALL_ROWS)).items;
    const snapshot = computeSnapshot({ portfolio, positions, asOf: now.toISOString(), startOfDay });
    const accounts = (await this.repos.brokerAccounts.list({ portfolioId: portfolio.id }, ALL_ROWS)).items;
    const live = (await this.repos.orders.list({ portfolioId: portfolio.id, statuses: ["ROUTED", "ACKNOWLEDGED", "PARTIALLY_FILLED", "PENDING_APPROVAL", "PENDING_RISK"] }, ALL_ROWS)).items;
    return {
      nav: snapshot.nav,
      cash: portfolio.cash,
      exposures: positions
        .filter((p) => p.closedAt === null)
        .map((p) => ({ instrumentId: p.instrumentId, symbol: p.symbol, assetClass: p.assetClass, marketValue: p.marketValue })),
      unrealizedPnl: snapshot.unrealizedPnl,
      dayPnl: snapshot.dayPnl,
      inceptionCapital: portfolio.inceptionCapital,
      openOrdersCount: await this.repos.orders.countByStatus(portfolio.id, OPEN_ORDER_STATUSES),
      agentNotionalToday: await this.repos.orders.sumAgentNotionalSince(portfolio.id, startOfDay),
      marginUsed: accounts.reduce((s, a) => s + a.marginUsed, 0),
      buyingPower: accounts.reduce((s, a) => s + a.buyingPower, 0),
      orderNotional: live.reduce((m, o) => Math.max(m, o.estimatedNotional), 0),
    };
  }

  private finding(rule: string, passed: boolean, message: string, observed: number | null, limit: number | null, onFail: Outcome, breach?: Finding["breach"]): Finding {
    return { check: { rule, passed, message, observed, limit }, outcome: passed ? "pass" : onFail, breach: passed ? undefined : breach };
  }

  private limitFinding(ev: LimitEvaluation, portfolio: Portfolio): Finding {
    const { limit } = ev;
    const rule = `limit:${limit.metric}:${limit.name}`;
    const obs = formatMetric(limit.metric, ev.observed);
    const thr = formatMetric(limit.metric, ev.threshold);
    if (ev.status === "breached") {
      // auto_unwind cannot be honoured pre-trade; treat as block.
      const outcome: Outcome = limit.action === "warn" ? "warn" : limit.action === "require_approval" ? "require_approval" : "block";
      return {
        check: { rule, passed: false, message: `${limit.name}: ${obs} exceeds limit ${thr}`, observed: ev.observed, limit: ev.threshold },
        outcome,
        breach: { limitId: limit.id, limitName: limit.name, metric: limit.metric, scope: limit.scope, scopeId: limit.scopeId ?? portfolio.id, observed: ev.observed, threshold: ev.threshold },
      };
    }
    if (ev.status === "warning") {
      return { check: { rule, passed: true, message: `${limit.name}: ${obs} above warning level (limit ${thr})`, observed: ev.observed, limit: ev.threshold }, outcome: "warn" };
    }
    return { check: { rule, passed: true, message: `${limit.name}: ${obs} within limit ${thr}`, observed: ev.observed, limit: ev.threshold }, outcome: "pass" };
  }

  private agentBreach(agent: PreTradeCheckContext["agent"], portfolio: Portfolio, order: Order, name: string): Finding["breach"] {
    return {
      limitId: agent ? `agent-policy:${agent.id}` : "agent-policy",
      limitName: name,
      metric: "order_notional",
      scope: "agent",
      scopeId: agent?.id ?? null,
      observed: order.estimatedNotional,
      threshold: 0,
    };
  }

  private async recordBreach(input: Omit<RiskBreach, "id" | "status" | "detectedAt" | "acknowledgedByUserId" | "resolvedByUserId" | "resolvedAt" | "resolutionNote">): Promise<RiskBreach> {
    const breach = await this.repos.riskBreaches.create({
      ...input,
      id: this.ids.next(ID_PREFIX.riskBreach),
      status: "open",
      detectedAt: this.clock.nowIso(),
      acknowledgedByUserId: null,
      resolvedByUserId: null,
      resolvedAt: null,
      resolutionNote: null,
    });
    this.logger.warn("Risk breach recorded", { breachId: breach.id, limit: breach.limitName, portfolioId: breach.portfolioId });
    await this.audit.record({
      action: "risk.breach_detected",
      actor: input.detectedBy,
      targetType: "RiskBreach",
      targetId: breach.id,
      portfolioId: breach.portfolioId,
      deskId: null,
      summary: `${breach.severity.toUpperCase()} breach: ${breach.message}`,
      data: { limitId: breach.limitId, metric: breach.metric, observed: breach.observed, threshold: breach.threshold, actionTaken: breach.actionTaken },
      ip: null,
    });
    return breach;
  }
}
