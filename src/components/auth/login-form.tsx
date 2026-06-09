"use client";

import { useFormStatus } from "react-dom";
import { loginAction } from "@/lib/auth/actions";

const loginErrorMessages: Record<string, string> = {
  missing_fields: "Enter your email and password.",
  invalid_credentials: "Invalid email or password.",
  profile_missing: "Your profile is not set up yet. Contact an administrator.",
  account_inactive: "Your account is not active yet. Contact an administrator.",
  profile_invalid: "Your profile role is not recognized. Contact an administrator.",
};

type LoginFormProps = {
  errorCode?: string;
};

export function LoginForm({ errorCode }: LoginFormProps) {
  const errorMessage = errorCode ? loginErrorMessages[errorCode] : null;

  return (
    <form className="mt-8 grid gap-5" action={loginAction}>
      {errorMessage ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-2">
        <label htmlFor="email" className="text-sm font-semibold text-[#001f4d]">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@tytanteams.com"
          required
          className="h-12 rounded-xl border border-zinc-300 bg-[#fffdf2] px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-[#001f4d] focus:bg-white focus:ring-4 focus:ring-[#f2d300]/30"
        />
      </div>

      <div className="grid gap-2">
        <label
          htmlFor="password"
          className="text-sm font-semibold text-[#001f4d]"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-xl border border-zinc-300 bg-[#fffdf2] px-3 text-sm text-zinc-950 outline-none transition focus:border-[#001f4d] focus:bg-white focus:ring-4 focus:ring-[#f2d300]/30"
        />
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 h-12 rounded-xl bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d] shadow-[0_10px_22px_rgba(242,211,0,0.28)] transition hover:bg-[#ffe43d] focus:outline-none focus:ring-4 focus:ring-[#001f4d]/20 disabled:cursor-wait disabled:bg-zinc-300 disabled:text-zinc-600 disabled:shadow-none"
    >
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}
