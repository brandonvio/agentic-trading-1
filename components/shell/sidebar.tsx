"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@/lib/ui/cn";
import { isNavActive, visibleNavItems, type NavItem } from "@/lib/ui/nav";
import { useOptionalSession } from "@/components/providers/session-provider";
import { ChevronLeftIcon, ChevronRightIcon, LogoMark } from "@/components/icons";
import { Kbd } from "@/components/ui/kbd";

const STORAGE_KEY = "ap:sidebar:collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Private browsing / blocked storage: collapse is a per-session nicety.
  }
}

/**
 * Tiny external store over localStorage so the sidebar reads persisted state
 * during hydration (server snapshot: expanded) instead of setting state in an
 * effect, and stays in sync across tabs.
 */
const listeners = new Set<() => void>();
let cachedCollapsed: boolean | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribeCollapsed(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      cachedCollapsed = null;
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getCollapsed(): boolean {
  if (cachedCollapsed === null) cachedCollapsed = readCollapsed();
  return cachedCollapsed;
}

function getServerCollapsed(): boolean {
  return false;
}

function persistCollapsed(value: boolean): void {
  cachedCollapsed = value;
  writeCollapsed(value);
  emit();
}

/** Split the visible items into `[sectionLabel | null, items]` groups, preserving order. */
export function groupNavItems(items: NavItem[]): Array<{ section: string | null; items: NavItem[] }> {
  const groups: Array<{ section: string | null; items: NavItem[] }> = [];
  for (const item of items) {
    if (item.section || groups.length === 0) groups.push({ section: item.section ?? null, items: [] });
    groups[groups.length - 1]!.items.push(item);
  }
  return groups;
}

export function Sidebar() {
  const pathname = usePathname() ?? "/";
  const session = useOptionalSession();
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsed, getServerCollapsed);

  const toggle = useCallback(() => persistCollapsed(!getCollapsed()), []);

  const groups = groupNavItems(visibleNavItems(session?.principal));

  return (
    <nav
      aria-label="Primary"
      data-collapsed={collapsed || undefined}
      className={cn(
        "shrink-0 flex flex-col border-r border-edge bg-surface-1 h-dvh sticky top-0 z-30 transition-[width] duration-150",
        collapsed ? "w-[3.25rem]" : "w-[13.5rem]",
      )}
    >
      <Link href="/dashboard" className="flex items-center gap-2.5 h-12 px-3 shrink-0 border-b border-edge">
        <LogoMark size={22} className="shrink-0" />
        {collapsed ? null : (
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold tracking-tight text-fg leading-none">Agentic Prop</span>
            <span className="block text-2xs text-fg-subtle leading-none mt-1">Trading Terminal</span>
          </span>
        )}
      </Link>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {groups.map((group, gi) => (
          <div key={group.section ?? `group-${gi}`} className={gi > 0 ? "mt-3" : undefined}>
            {group.section && !collapsed ? <p className="label-caps px-3 mb-1">{group.section}</p> : null}
            {group.section && collapsed ? <div className="mx-3 mb-2 border-t border-edge" aria-hidden="true" /> : null}
            <ul className="px-1.5 space-y-px">
              {group.items.map((item) => {
                const active = isNavActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 h-7 rounded-md px-2 transition-colors",
                        collapsed && "justify-center px-0",
                        active ? "bg-accent/15 text-accent-strong" : "text-fg-muted hover:text-fg hover:bg-surface-2",
                      )}
                    >
                      <Icon size={15} className="shrink-0" />
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        <>
                          <span className="truncate text-xs font-medium">{item.label}</span>
                          {item.shortcut ? (
                            <Kbd keys={item.shortcut.split(" ")} className="ml-auto opacity-0 group-hover:opacity-100" />
                          ) : null}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-edge p-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex items-center gap-2 h-7 w-full rounded-md px-2 text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <ChevronRightIcon size={14} /> : <ChevronLeftIcon size={14} />}
          {collapsed ? null : <span className="text-2xs">Collapse</span>}
        </button>
      </div>
    </nav>
  );
}
