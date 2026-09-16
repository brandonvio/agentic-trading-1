/** Default registry: one adapter per BrokerKey, resolved by key or by asset class. */
import { NotFoundError } from "@/lib/core/errors";
import { ASSET_CLASS_BROKER, type AssetClass, type BrokerKey } from "@/lib/domain/instrument";
import type { BrokerAdapter, BrokerRegistry } from "./types";

export class DefaultBrokerRegistry implements BrokerRegistry {
  private readonly adapters = new Map<BrokerKey, BrokerAdapter>();

  constructor(adapters: BrokerAdapter[]) {
    for (const adapter of adapters) this.adapters.set(adapter.key, adapter);
  }

  get(key: BrokerKey): BrokerAdapter {
    const adapter = this.adapters.get(key);
    if (!adapter) throw new NotFoundError("Broker", key);
    return adapter;
  }

  forAssetClass(assetClass: AssetClass): BrokerAdapter {
    return this.get(ASSET_CLASS_BROKER[assetClass]);
  }

  all(): BrokerAdapter[] {
    return [...this.adapters.values()];
  }
}
