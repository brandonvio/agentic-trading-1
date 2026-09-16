"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/ui/cn";
import { humanize, initials } from "@/lib/ui/format";
import { useSession } from "@/components/providers/session-provider";
import { Badge } from "@/components/ui/badge";
import { ChevronDownIcon, LogoutIcon, UsersIcon } from "@/components/icons";

export function UserMenu() {
  const { user, principal } = useSession();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 h-7 rounded-md pl-1 pr-1.5 border border-transparent transition-colors",
          open ? "bg-surface-3 border-edge-strong" : "hover:bg-surface-2",
        )}
      >
        <span
          aria-hidden="true"
          style={{ backgroundColor: `${user.avatarColor}26`, color: user.avatarColor, borderColor: `${user.avatarColor}59` }}
          className="num flex size-5 shrink-0 items-center justify-center rounded border text-2xs font-semibold"
        >
          {initials(user.name)}
        </span>
        <span className="hidden md:block max-w-32 truncate text-xs text-fg">{user.name}</span>
        <ChevronDownIcon size={12} className="text-fg-subtle" />
      </button>

      {open ? (
        <div role="menu" aria-label="Account" className="panel absolute right-0 top-9 z-50 w-64 p-1">
          <div className="px-2.5 py-2 border-b border-edge">
            <p className="text-xs font-medium text-fg truncate">{user.name}</p>
            <p className="text-2xs text-fg-subtle truncate">{user.title}</p>
            <p className="text-2xs text-fg-subtle truncate">{user.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {principal.roles.map((role) => (
                <Badge key={role} tone="accent" size="xs">
                  {humanize(role)}
                </Badge>
              ))}
            </div>
            <p className="mt-1.5 text-2xs text-fg-subtle">
              {principal.permissions.length} permissions · {principal.allDesks ? "all desks" : `${principal.deskIds.length} desk(s)`}
            </p>
          </div>
          <Link
            role="menuitem"
            href="/admin/users"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 h-7 rounded px-2.5 text-xs text-fg-muted hover:text-fg hover:bg-surface-2"
          >
            <UsersIcon size={13} />
            Users &amp; roles
          </Link>
          <form action={logoutAction}>
            <button
              role="menuitem"
              type="submit"
              className="flex w-full items-center gap-2 h-7 rounded px-2.5 text-xs text-fg-muted hover:text-negative hover:bg-negative/10"
            >
              <LogoutIcon size={13} />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
