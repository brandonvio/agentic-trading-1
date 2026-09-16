import { redirect } from "next/navigation";

/**
 * The platform has no marketing surface: `/` always resolves to the terminal.
 * `proxy.ts` bounces unauthenticated visitors on to `/login` from there.
 */
export default function Home() {
  redirect("/dashboard");
}
