import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BowlFood,
  EnvelopeSimple,
  LockKey,
} from "@phosphor-icons/react";
import { Button, InlineError } from "../components/Ui";
import { useApp } from "../state/AppContext";

export function SignIn() {
  const { signIn, bootState } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (bootState !== "loading") void signIn(email, password);
  };

  return (
    <div className="grid min-h-[100dvh] bg-[#f5f5f0] md:grid-cols-[minmax(0,1.08fr)_minmax(24rem,.92fr)]">
      <section className="relative hidden overflow-hidden border-r border-zinc-200 p-10 md:flex md:flex-col md:justify-between lg:p-16">
        <div className="map-grid absolute inset-0 opacity-40" />
        <a href="/" className="relative flex items-center gap-2 text-sm font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 text-white">
            <BowlFood size={19} />
          </span>
          Courtyard
        </a>
        <div className="relative max-w-xl">
          <p className="mb-5 font-mono text-xs uppercase tracking-[.2em] text-emerald-800">
            Dormitory batch delivery
          </p>
          <h1 className="text-4xl font-semibold leading-[.98] tracking-[-.045em] text-zinc-900 lg:text-6xl">
            One route. Clear roles.
          </h1>
          <p className="mt-6 max-w-[52ch] text-base leading-relaxed text-zinc-600">
            Sign in with your assigned account. Your workspace and permissions
            come directly from the authenticated role.
          </p>
        </div>
        <div className="relative grid grid-cols-2 gap-4 border-t border-zinc-300 pt-5 font-mono text-[10px] uppercase tracking-[.16em] text-zinc-500">
          <span>JWT protected</span>
          <span>Role-based access</span>
        </div>
      </section>

      <main className="flex items-center px-4 py-10 sm:px-8 lg:px-14">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-9">
            <div className="mb-8 flex items-center gap-2 text-sm font-semibold md:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 text-white">
                <BowlFood size={19} />
              </span>
              Courtyard
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-emerald-800">
              Secure access
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-.035em] text-zinc-900">
              Sign in
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">
              Enter the email and password assigned to your account.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-800">
                Email
              </span>
              <span className="relative block">
                <EnvelopeSimple
                  aria-hidden="true"
                  size={18}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-800">
                Password
              </span>
              <span className="relative block">
                <LockKey
                  aria-hidden="true"
                  size={18}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your password"
                  className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                />
              </span>
            </label>
            <Button
              type="submit"
              busy={bootState === "loading"}
              className="w-full"
            >
              Sign in <ArrowRight size={17} />
            </Button>
          </form>

          {bootState === "loading" && (
            <p
              className="mt-5 font-mono text-[10px] uppercase tracking-[.15em] text-zinc-500"
              role="status"
            >
              Verifying credentials
            </p>
          )}
          {bootState === "error" && (
            <div className="mt-5">
              <InlineError>
                Email or password is incorrect, or the API is unavailable.
              </InlineError>
            </div>
          )}
          <p className="mt-8 border-t border-zinc-200 pt-5 text-xs leading-relaxed text-zinc-500">
            Demo accounts use the credentials documented in the project README.
          </p>
          <a href="/" className="mt-4 inline-flex text-xs font-medium text-zinc-500 hover:text-zinc-900">
            ← Back to product overview
          </a>
        </div>
      </main>
    </div>
  );
}
