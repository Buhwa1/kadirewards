"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" disabled={pending}>
      {pending ? "Working…" : label}
    </button>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const action = mode === "in" ? signIn : signUp;
  const [state, formAction] = useActionState<AuthState, FormData>(action, {});

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between bg-ink px-12 py-12 text-paper lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="k-mark h-8 w-8 rounded-md bg-paper text-[13px] text-ink">K</div>
          <span className="text-[15px] font-semibold tracking-tight">Kadi</span>
        </Link>
        <div>
          <p className="font-display text-4xl font-medium leading-[1.15] tracking-tight">
            The ledger behind the counter.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">
            Owners and managers sign in here. Cashiers use a PIN on the till — they never see this
            screen.
          </p>
        </div>
        <p className="text-xs text-white/35">Kampala · East Africa</p>
      </aside>

      <section className="flex flex-col justify-center px-5 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="mb-10 flex items-center gap-2.5 lg:hidden">
            <div className="k-mark h-8 w-8 rounded-md text-[13px]">K</div>
            <span className="text-[15px] font-semibold tracking-tight">Kadi</span>
          </Link>

          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mute">
            {mode === "in" ? "Business access" : "New business"}
          </p>
          <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">
            {mode === "in" ? "Sign in" : "Create an account"}
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {mode === "in"
              ? "Owners and managers only. Cashiers use a PIN on the till."
              : "30 days free. No card needed — you'll pay by Mobile Money later."}
          </p>

          <form action={formAction} className="mt-8 space-y-4" key={mode}>
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input id="email" name="email" type="email" required className="input" autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="input"
                autoComplete={mode === "in" ? "current-password" : "new-password"}
              />
            </div>

            {state.error && (
              <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{state.error}</p>
            )}
            {state.notice && (
              <p className="rounded-lg bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800">{state.notice}</p>
            )}

            <Submit label={mode === "in" ? "Sign in" : "Create account"} />
          </form>

          <button
            onClick={() => setMode(mode === "in" ? "up" : "in")}
            className="mt-6 w-full text-center text-sm text-ink-mute hover:text-ink"
          >
            {mode === "in" ? "New here? Create a business account" : "Already have an account? Sign in"}
          </button>

          <Link
            href="/till"
            className="mt-8 block text-center text-sm text-ink-mute hover:text-ink"
          >
            Looking for the till
            <span className="ml-1">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
