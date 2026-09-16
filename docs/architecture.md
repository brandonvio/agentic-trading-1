# Agentic Prop — Architecture

An AI-native, agent-first proprietary trading platform. Everything below is
mocked end-to-end (brokers, market data, LLM) but structured so each mock can
be replaced by a real integration without touching the layers above it.

## Stack

- Next.js 16 (App Router, `proxy.ts`, route handlers, server components), React 19, Tailwind 4
- Neo4j 2026.07 enterprise (`agenticprop` dev db, `agenticproptest` test db), `neo4j-driver` 6
- Zod 4 for every domain schema and API input
- Vitest (unit + integration), Playwright (e2e against `http://localhost:3001`)

## Layering (dependency direction: top → bottom only)

```
app/**                UI (server components, client islands) + app/api/** route handlers
lib/api/handler.ts    withAuth(permission, handler, {query, body}) → Principal, validation, error envelope
lib/services/**       Application services (business rules, authorization, audit) — see interfaces.ts
lib/agents/**         Agent runtime + agent definitions (tools call services, never repos)
lib/llm/**            LLMProvider (mock | anthropic)          lib/brokers/**  BrokerAdapter per venue + registry
lib/repositories/**   Repository interfaces; neo4j/ and memory/ implementations
lib/db/neo4j.ts       Driver wrapper                          lib/domain/**   Entities + zod schemas (pure)
lib/core/**           Result, errors, ids, clock, logger, DI container, tokens
lib/container.ts      Composition root: buildContainer(), getContainer(), services()
```

Rules:
- Services take a `Principal` as first argument and enforce permissions + desk/portfolio visibility themselves. Route handlers only pre-check a coarse permission.
- Repositories are thin persistence; no business rules. Every repository has a Neo4j and an in-memory implementation with identical behaviour (shared contract tests).
- Ids come from `IdGenerator`, time from `Clock` (both injected). Never `Date.now()` / `Math.random()` inside services (mocks may use a seeded PRNG).
- Errors: throw `AppError` subclasses (`lib/core/errors.ts`). Business-rule "rejections" that are expected outcomes (risk-rejected order) are returned as state, not thrown.
- All timestamps are ISO-8601 strings in UTC. Money is a JS number in the portfolio base currency unless stated.

## Domain model (see `lib/domain/*.ts`)

Users & RBAC → Desks → Portfolios → BrokerAccounts / Positions / Orders / Fills → Instruments;
Strategies (deployed to portfolios) → Agents (scoped to portfolio or global) → AgentRuns → AgentSteps → Signals → Orders;
RiskLimits (platform/desk/portfolio/strategy/agent scope) → RiskBreaches; ApprovalRequests (four-eyes); AuditEvents.

### Roles (lib/auth/permissions.ts)
global_admin, cio, portfolio_manager, trader, quant_researcher, risk_manager, compliance_officer, operations, analyst.
Permissions are `resource:action` strings; roles are additive. `global_admin`, `cio`, `risk_manager`, `compliance_officer`, `operations` see all desks; others see only their `deskIds`.

### Agents (lib/domain/agent.ts)
Kinds: market_intelligence, strategy_research, signal_generation, execution, risk_sentinel, compliance, portfolio_manager.
Autonomy: advisory (no orders) · supervised (orders always need approval) · autonomous (orders within mandate/thresholds).
Every run is persisted as `AgentRun` + ordered `AgentStep`s (thought / tool_call / tool_result / message / error) with token + cost accounting.

### Order pipeline (OrderService.submit)
validate → resolve instrument/portfolio/broker account → estimate notional → RiskService.preTradeCheck →
`block` ⇒ RISK_REJECTED (breach recorded) · `require_approval` ⇒ PENDING_APPROVAL (ApprovalRequest) · `pass|warn` ⇒ ROUTED →
BrokerAdapter.placeOrder → fills → position upsert (avg price / realised PnL) → portfolio cash/NAV → audit events.
Agent-originated orders additionally check: agent autonomy, portfolio mandate `agentTradingEnabled`, `agentApprovalThresholdNotional`, agent `maxNotionalPerRun`.

## Neo4j graph model

Node labels carry the entity name; every node has a unique `id` property and stores scalar props flat. Nested objects (mandate, details, riskChecks, factors, deployments, data) are stored as JSON strings in a `_json` convention: property `<name>Json`. Repositories serialise/deserialise transparently.

```
(:User)-[:HAS_ROLE]->(:Role)-[:GRANTS]->(:Permission)
(:User)-[:MEMBER_OF]->(:Desk)            (:Desk)-[:HEADED_BY]->(:User)
(:Portfolio)-[:BELONGS_TO]->(:Desk)      (:Portfolio)-[:MANAGED_BY]->(:User)
(:BrokerAccount)-[:FUNDS]->(:Portfolio)  (:BrokerAccount)-[:AT]->(:Broker {key})
(:Instrument)-[:TRADES_ON]->(:Broker)
(:Position)-[:IN]->(:Portfolio)  (:Position)-[:OF]->(:Instrument)  (:Position)-[:VIA]->(:BrokerAccount)  (:Position)-[:OWNED_BY]->(:Strategy)?
(:Order)-[:IN]->(:Portfolio) (:Order)-[:FOR]->(:Instrument) (:Order)-[:VIA]->(:BrokerAccount) (:Order)-[:FROM_SIGNAL]->(:Signal)? (:Order)-[:BY_RUN]->(:AgentRun)? (:Order)-[:CREATED_BY]->(:User|:Agent)
(:Fill)-[:FILLS]->(:Order)
(:Bar {interval})-[:OF]->(:Instrument)
(:Strategy)-[:OWNED_BY]->(:User) (:Strategy)-[:ON_DESK]->(:Desk) (:Strategy)-[:DEPLOYED_TO {allocatedCapital, deployedAt}]->(:Portfolio) (:Strategy)-[:TRADES]->(:Instrument)
(:Backtest)-[:OF]->(:Strategy)
(:Agent)-[:SCOPED_TO]->(:Portfolio)? (:Agent)-[:RUNS]->(:Strategy)* (:Agent)-[:OWNED_BY]->(:User)
(:AgentRun)-[:BY]->(:Agent) (:AgentRun)-[:FOR]->(:Portfolio)? (:AgentStep)-[:IN {index}]->(:AgentRun)
(:Signal)-[:ON]->(:Instrument) (:Signal)-[:FROM_RUN]->(:AgentRun)? (:Signal)-[:FOR]->(:Portfolio)? (:Signal)-[:FROM_STRATEGY]->(:Strategy)?
(:RiskLimit)-[:APPLIES_TO]->(:Desk|:Portfolio|:Strategy|:Agent)?   (platform scope has no edge)
(:RiskBreach)-[:OF]->(:RiskLimit) (:RiskBreach)-[:IN]->(:Portfolio)?
(:ApprovalRequest)-[:SUBJECT]->(any) (:ApprovalRequest)-[:REQUESTED_BY]->(:User|:Agent) (:ApprovalRequest)-[:DECIDED_BY]->(:User)?
(:AuditEvent)-[:ACTOR]->(:User|:Agent)? (:AuditEvent)-[:TARGET]->(any)? (:AuditEvent)-[:IN]->(:Portfolio)?
```

Constraints: `id` uniqueness per label; `User.email`, `Desk.code`, `Portfolio.code`, `Instrument.symbol`, `Strategy.code`, `Role.key`, `Broker.key`, `Permission.key` unique. Indexes on `Order.status`, `Order.portfolioId`, `Position.portfolioId`, `AuditEvent.at`, `Signal.status`, `AgentRun.agentId`, `Bar.instrumentId+interval+time`.

## API conventions (app/api/**)

- Envelope: success `{ data }`, error `{ error: { code, message, details } }`.
- Lists: `?limit=&offset=` plus filter params; response `{ data: { items, total, limit, offset } }`.
- Auth: `ap_session` cookie (HMAC-signed, see `lib/auth/session.ts`); `Authorization: Bearer <token>` also accepted.
- Every mutating endpoint goes through a service which writes an `AuditEvent`.

## Testing

- `tests/unit/**` — services with in-memory repos, mock brokers, mock LLM; pure functions.
- `tests/integration/**` — Neo4j repositories against `agenticproptest` (each file clears the db in `beforeAll`), route handlers via `buildContainer({persistence:"memory"})`.
- `tests/e2e/**` — Playwright against the running dev server, one spec per role journey.
- Scripts: `pnpm db:schema`, `pnpm db:seed`, `pnpm db:reset`, `pnpm test`, `pnpm test:e2e`, `pnpm check`.

## Implementation notes learned in the build

These are non-obvious constraints the code depends on; changing them will break things quietly.

**DI tokens use `Symbol.for`, not `Symbol`.** Next.js evaluates a module once per bundle, so `lib/core/tokens.ts` can exist more than once in a single process. Unique symbols would differ between instances and the `globalThis`-cached container would fail to resolve. Token descriptions must therefore stay unique.

**`isAppError` is structural, not `instanceof`.** For the same reason, an `AppError` thrown inside one bundle is not `instanceof` another bundle's class. Errors carry a brand (`APP_ERROR_BRAND`) that `isAppError` checks, which is what keeps HTTP status mapping and server-action messages correct.

**Route handlers must tolerate a missing `params`.** Static routes are invoked with a context whose `params` is `undefined`; `lib/api/handler.ts` normalises it.

**Repository `create` is an upsert.** `createNode` MERGEs on `id`, which makes seeding idempotent. Creating the same id twice updates rather than throwing.

**Day PnL needs a prior-close mark.** `Position.previousClose` carries it; without it a book held from earlier days would report zero day PnL. See `dayPnlOf` in `lib/services/helpers/portfolio-math.ts`.

**Permission gates must agree between route and service.** The route pre-check is coarse and the service is authoritative; where they disagreed (breach acknowledge, signal dismiss) a user was accepted by the route and then denied by the service. Keep them aligned.

**Closing a position is not creating an order.** `positions:close` is the gate for `closePosition`, deliberately bypassing `orders:create` so a risk manager can flatten risk without being able to open new positions.
