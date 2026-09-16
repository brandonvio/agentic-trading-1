"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { hasPermission } from "@/lib/auth/permissions";
import type { Permission, Principal, User } from "@/lib/domain/auth";

/** Serialisable session handed down from the authenticated shell. */
export interface SessionValue {
  user: User;
  principal: Principal;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
  // Re-memoised on identity change only; the shell passes a fresh object per render.
  const session = useMemo(() => value, [value]);
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** Session or null — for components that may render outside the shell. */
export function useOptionalSession(): SessionValue | null {
  return useContext(SessionContext);
}

/** Session inside the authenticated shell. Throws if the provider is missing. */
export function useSession(): SessionValue {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used within <SessionProvider>");
  return session;
}

/** `useCan("orders:create")` — false when there is no session. */
export function useCan(permission: Permission): boolean {
  const session = useContext(SessionContext);
  return session ? hasPermission(session.principal, permission) : false;
}

/** True when the principal holds every listed permission. */
export function useCanAll(permissions: readonly Permission[]): boolean {
  const session = useContext(SessionContext);
  return session ? permissions.every((p) => hasPermission(session.principal, p)) : false;
}

export type { Principal, User };
