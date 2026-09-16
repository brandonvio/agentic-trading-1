import type { PageQuery, Paged } from "@/lib/domain/common";
import { Instrument, type AssetClass, type BrokerKey } from "@/lib/domain/instrument";
import type { InstrumentRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";

const def: NodeDef<Instrument> = {
  label: "Instrument",
  schema: Instrument,
  jsonFields: ["details"],
  hasUpdatedAt: true,
  links: (i) => [relink({ label: "Instrument", id: i.id, rel: "TRADES_ON", targetLabels: ["Broker"], matchProp: "key", targetId: i.broker })],
};

export class Neo4jInstrumentRepository extends NodeRepository<Instrument> implements InstrumentRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<Instrument | null> {
    return this.findNodeById(id);
  }

  findBySymbol(symbol: string): Promise<Instrument | null> {
    return this.findNodeBy("symbol", symbol);
  }

  listByIds(ids: string[]): Promise<Instrument[]> {
    return this.findNodesByIds(ids, "n.symbol ASC");
  }

  list(
    filter: { assetClass?: AssetClass; broker?: BrokerKey; search?: string; tradable?: boolean },
    page: PageQuery,
  ): Promise<Paged<Instrument>> {
    const search = filter.search?.trim();
    const where = new Where()
      .eq("assetClass", filter.assetClass)
      .eq("broker", filter.broker)
      .eq("tradable", filter.tradable)
      .when(!!search, "toLower(n.symbol) CONTAINS toLower($search) OR toLower(n.name) CONTAINS toLower($search)", { search });
    return this.listNodes({ where, orderBy: "n.symbol ASC, n.id ASC" }, page);
  }

  create(instrument: Instrument): Promise<Instrument> {
    return this.createNode(instrument);
  }

  createMany(instruments: Instrument[]): Promise<number> {
    return this.createNodes(instruments);
  }

  update(id: string, patch: Partial<Omit<Instrument, "id" | "createdAt">>): Promise<Instrument> {
    return this.updateNode(id, patch);
  }
}
