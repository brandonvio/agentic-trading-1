"use client";

import { useActionState, type ReactNode } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { AlertIcon } from "@/components/icons";

const INITIAL_LOGIN_STATE: LoginState = { error: null, email: "" };

export interface LoginFormProps {
  next: string;
  /** Server-rendered candidate cards (each is a submit button). */
  candidates: ReactNode;
  hasCandidates: boolean;
}

export function LoginForm({ next, candidates, hasCandidates }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_LOGIN_STATE);

  return (
    <div className="space-y-4">
      {state.error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
          <AlertIcon size={14} className="mt-px shrink-0" />
          {state.error}
        </p>
      ) : null}

      {hasCandidates ? (
        <form action={formAction} aria-busy={pending} aria-label="Sign in as a seeded user">
          <input type="hidden" name="next" value={next} />
          <div className="grid gap-2 sm:grid-cols-2">{candidates}</div>
        </form>
      ) : null}

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-edge" />
        <span className="label-caps">or by email</span>
        <span className="h-px flex-1 bg-edge" />
      </div>

      <form action={formAction} className="space-y-3" aria-busy={pending}>
        <input type="hidden" name="next" value={next} />
        <Field
          label="Work email"
          htmlFor="email"
          help="Mock authentication — any seeded, active user signs in without a password."
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            spellCheck={false}
            placeholder="name@agenticprop.com"
            defaultValue={state.email}
            invalid={Boolean(state.error)}
          />
        </Field>
        <Button type="submit" variant="primary" loading={pending} className="w-full">
          Sign in
        </Button>
      </form>
    </div>
  );
}
