import { humanize, initials } from "@/lib/ui/format";
import { Badge } from "@/components/ui/badge";
import type { RoleKey } from "@/lib/domain/auth";

export interface LoginCandidate {
  id: string;
  email: string;
  name: string;
  title: string;
  roles: RoleKey[];
  avatarColor: string;
}

/**
 * A candidate is a submit button inside the login form: clicking it posts its
 * own `email` name/value pair, so the whole grid works without JavaScript.
 */
export function CandidateCard({ candidate }: { candidate: LoginCandidate }) {
  return (
    <button
      type="submit"
      name="email"
      value={candidate.email}
      className="panel group flex w-full items-start gap-2.5 p-2.5 text-left transition-colors hover:border-accent/50 hover:bg-surface-2 focus-visible:border-accent"
    >
      <span
        aria-hidden="true"
        style={{
          backgroundColor: `${candidate.avatarColor}26`,
          color: candidate.avatarColor,
          borderColor: `${candidate.avatarColor}59`,
        }}
        className="num flex size-8 shrink-0 items-center justify-center rounded-md border text-xs font-semibold"
      >
        {initials(candidate.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-fg">{candidate.name}</span>
        <span className="block truncate text-2xs text-fg-subtle">{candidate.title}</span>
        <span className="mt-1.5 flex flex-wrap gap-1">
          {candidate.roles.slice(0, 2).map((role) => (
            <Badge key={role} tone="accent" size="xs">
              {humanize(role)}
            </Badge>
          ))}
          {candidate.roles.length > 2 ? (
            <Badge tone="muted" size="xs">
              +{candidate.roles.length - 2}
            </Badge>
          ) : null}
        </span>
      </span>
    </button>
  );
}
