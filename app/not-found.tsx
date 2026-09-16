import { ButtonLink } from "@/components/ui/button";
import { LogoMark, SearchIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="panel w-full max-w-md p-6 text-center">
        <LogoMark size={28} className="mx-auto" />
        <p className="num mt-4 text-3xl font-semibold tracking-tight text-fg">404</p>
        <h1 className="mt-1 text-sm font-medium text-fg">Route not found</h1>
        <p className="mt-1.5 text-xs text-fg-muted">
          That page does not exist on this terminal. It may have been renamed, or the entity behind it is not visible to
          your role.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <ButtonLink href="/dashboard" size="sm" variant="primary">
            Firm overview
          </ButtonLink>
          <ButtonLink href="/market" size="sm" variant="secondary" icon={<SearchIcon size={13} />}>
            Market
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
