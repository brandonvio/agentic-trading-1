import type { Metadata } from "next";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { EmptyState } from "@/components/ui/empty-state";
import { CandidateCard, type LoginCandidate } from "./_components/candidate-card";
import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = {
  title: "Sign in · Agentic Prop",
  description: "Sign in to the Agentic Prop trading terminal.",
};

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function LoginPage(props: PageProps<"/login">) {
  const next = firstParam((await props.searchParams).next);
  const candidates = await safe(() => services().auth.listLoginCandidates());
  const items: LoginCandidate[] = candidates.ok ? candidates.value.map((c) => ({ ...c, roles: [...c.roles] })) : [];

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-lg font-semibold tracking-tight text-fg">Sign in as</h1>
        <p className="mt-1 text-xs text-fg-muted">
          Pick a seeded desk identity to explore the platform through that role&rsquo;s permissions, or sign in with an
          email address.
        </p>
      </header>

      {!candidates.ok ? (
        <div className="mb-4">
          <EmptyState
            compact
            tone="warning"
            title="Directory unavailable"
            description="The user directory could not be loaded — the database may not be seeded yet. You can still sign in with an email address below."
          />
        </div>
      ) : null}

      <LoginForm
        next={next}
        hasCandidates={items.length > 0}
        candidates={items.map((candidate) => (
          <CandidateCard key={candidate.id} candidate={candidate} />
        ))}
      />

      <p className="mt-6 border-t border-edge pt-4 text-2xs text-fg-subtle">
        Sessions are signed, HTTP-only and expire after a 12-hour trading day. Every sign-in is written to the audit
        trail.
      </p>
    </div>
  );
}
