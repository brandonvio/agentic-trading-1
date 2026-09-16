/**
 * Broker layer composition: builds the shared MarketSimulator and the five
 * mock venue adapters, and binds `TOKENS.brokers`.
 */
import type { Clock } from "@/lib/core/clock";
import type { Container } from "@/lib/core/container";
import { TOKENS } from "@/lib/core/tokens";
import { CoinbaseAdapter } from "./coinbase";
import { InteractiveBrokersAdapter } from "./ibkr";
import { KalshiAdapter } from "./kalshi";
import { MarketSimulator } from "./market-simulator";
import { OandaAdapter } from "./oanda";
import { DefaultBrokerRegistry } from "./registry";
import { TradovateAdapter } from "./tradovate";
import type { BrokerRegistry } from "./types";

export const DEFAULT_BROKER_SEED = 42;

export interface CreateBrokerRegistryOptions {
  clock: Clock;
  seed?: number;
  /** Adapters sleep for a simulated round-trip on order/health calls. Default false. */
  simulateLatency?: boolean;
}

/** Builds a registry whose adapters share one seeded simulator. */
export function createBrokerRegistry(opts: CreateBrokerRegistryOptions): BrokerRegistry & { simulator: MarketSimulator } {
  const simulator = new MarketSimulator({ clock: opts.clock, seed: opts.seed ?? DEFAULT_BROKER_SEED });
  const adapterOpts = { simulator, clock: opts.clock, simulateLatency: opts.simulateLatency ?? false };
  const registry = new DefaultBrokerRegistry([
    new InteractiveBrokersAdapter(adapterOpts),
    new OandaAdapter(adapterOpts),
    new TradovateAdapter(adapterOpts),
    new CoinbaseAdapter(adapterOpts),
    new KalshiAdapter(adapterOpts),
  ]);
  return Object.assign(registry, { simulator });
}

/** Parses BROKER_SEED from the environment (falls back to the default seed). */
export function brokerSeedFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.BROKER_SEED);
  return Number.isFinite(parsed) && env.BROKER_SEED !== undefined && env.BROKER_SEED !== "" ? parsed : DEFAULT_BROKER_SEED;
}

/** Registers `TOKENS.brokers` using the container's Clock. */
export function registerBrokers(c: Container): void {
  c.register(TOKENS.brokers, (container) =>
    createBrokerRegistry({
      clock: container.resolve(TOKENS.clock),
      seed: brokerSeedFromEnv(),
      simulateLatency: process.env.BROKER_SIMULATE_LATENCY === "true",
    }),
  );
}

export { MarketSimulator, BAR_INTERVAL_MINUTES } from "./market-simulator";
export type { MarketSimulatorOptions } from "./market-simulator";
export { MockBrokerAdapter } from "./base-adapter";
export type { MockAdapterOptions, VenueProfile, OrderRejection } from "./base-adapter";
export { InteractiveBrokersAdapter } from "./ibkr";
export { OandaAdapter } from "./oanda";
export { TradovateAdapter, FUTURES_TICKS } from "./tradovate";
export { CoinbaseAdapter } from "./coinbase";
export { KalshiAdapter, kalshiFee } from "./kalshi";
export { DefaultBrokerRegistry } from "./registry";
export { SeededRandom, hashString, combineSeeds } from "./prng";
export { referenceFor, impliedVolFor } from "./reference-prices";
export { roundToTick, isMultipleOf, decimalsOf } from "./pricing";
export { blackScholes } from "./black-scholes";
export * from "./types";
