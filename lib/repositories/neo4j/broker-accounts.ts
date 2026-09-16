import type { PageQuery, Paged } from "@/lib/domain/common";
import type { BrokerKey } from "@/lib/domain/instrument";
import { BrokerAccount } from "@/lib/domain/portfolio";
import type { BrokerAccountRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";

const def: NodeDef<BrokerAccount> = {
  label: "BrokerAccount",
  schema: BrokerAccount,
  jsonFields: [],
  hasUpdatedAt: true,
  links: (a) => [
    relink({ label: "BrokerAccount", id: a.id, rel: "FUNDS", targetLabels: ["Portfolio"], targetId: a.portfolioId }),
    relink({ label: "BrokerAccount", id: a.id, rel: "AT", targetLabels: ["Broker"], matchProp: "key", targetId: a.broker }),
  ],
};

export class Neo4jBrokerAccountRepository extends NodeRepository<BrokerAccount> implements BrokerAccountRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<BrokerAccount | null> {
    return this.findNodeById(id);
  }

  async findByPortfolioAndBroker(portfolioId: string, broker: BrokerKey): Promise<BrokerAccount | null> {
    const rows = await this.findNodes(
      new Where().eq("portfolioId", portfolioId).eq("broker", broker),
      "n.createdAt DESC, n.id DESC",
      "",
    );
    return rows[0] ?? null;
  }

  list(
    filter: { portfolioId?: string; broker?: BrokerKey; status?: BrokerAccount["status"] },
    page: PageQuery,
  ): Promise<Paged<BrokerAccount>> {
    const where = new Where().eq("portfolioId", filter.portfolioId).eq("broker", filter.broker).eq("status", filter.status);
    return this.listNodes({ where, orderBy: "n.createdAt DESC, n.id DESC" }, page);
  }

  create(account: BrokerAccount): Promise<BrokerAccount> {
    return this.createNode(account);
  }

  update(id: string, patch: Partial<Omit<BrokerAccount, "id" | "createdAt">>): Promise<BrokerAccount> {
    return this.updateNode(id, patch);
  }
}
