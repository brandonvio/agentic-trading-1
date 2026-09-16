import { withPublic } from "@/lib/api/handler";
import { services } from "@/lib/container";

export const GET = withPublic(() => services().auth.listLoginCandidates());
