import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { page, principal } from "@/app/(app)/_lib/data";

export const loadStrategy = cache((id: string) => safe(async () => services().strategies.get(await principal(), id)));

export const loadBacktests = cache((id: string) =>
  safe(async () => services().strategies.listBacktests(await principal(), id, page(20))),
);