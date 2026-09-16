import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { principal } from "@/app/(app)/_lib/data";

export const loadRun = cache((id: string) => safe(async () => services().agents.getRun(await principal(), id)));

export const loadRunSteps = cache((id: string) => safe(async () => services().agents.listSteps(await principal(), id)));