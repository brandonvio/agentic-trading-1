import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { page, principal } from "@/app/(app)/_lib/data";

export const loadAgent = cache((id: string) => safe(async () => services().agents.get(await principal(), id)));

export const loadAgentRuns = cache((agentId: string) =>
  safe(async () => services().agents.listRuns(await principal(), { agentId }, page(25))),
);