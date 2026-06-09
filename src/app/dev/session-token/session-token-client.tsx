"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TokenState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; email: string; accessToken: string }
  | { status: "error"; message: string };

export function DevSessionTokenClient() {
  const [tokenState, setTokenState] = useState<TokenState>({
    status: "loading",
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        setTokenState({ status: "error", message: error.message });
        return;
      }

      if (!data.session) {
        setTokenState({ status: "missing" });
        return;
      }

      setTokenState({
        status: "ready",
        email: data.session.user.email ?? "Unknown email",
        accessToken: data.session.access_token,
      });
    }

    loadSession();

    return () => {
      isMounted = false;
    };
  }, []);

  async function copyToken() {
    if (tokenState.status !== "ready") return;

    await navigator.clipboard.writeText(tokenState.accessToken);
    setCopied(true);
  }

  return (
    <main className="min-h-screen bg-[#fffdf2] px-4 py-10 text-zinc-950">
      <div className="mx-auto grid max-w-3xl gap-5 rounded-lg border border-[#efe6b6] bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase text-[#f2d300]">
            Development only
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-normal text-[#001f4d]">
            Supabase Session Token
          </h1>
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            Do not share this token.
          </p>
        </div>

        {tokenState.status === "loading" ? (
          <p className="text-sm text-zinc-600">Loading session...</p>
        ) : null}

        {tokenState.status === "missing" ? (
          <p className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] px-4 py-3 text-sm text-zinc-700">
            No active session. Please log in first.
          </p>
        ) : null}

        {tokenState.status === "error" ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {tokenState.message}
          </p>
        ) : null}

        {tokenState.status === "ready" ? (
          <section className="grid gap-4">
            <div>
              <p className="text-sm font-bold text-[#001f4d]">Logged-in user</p>
              <p className="mt-1 text-sm text-zinc-700">{tokenState.email}</p>
            </div>

            <label className="grid gap-2 text-sm font-bold text-[#001f4d]">
              Access token
              <textarea
                readOnly
                value={tokenState.accessToken}
                className="min-h-44 rounded-lg border border-zinc-300 bg-[#fffdf2] p-3 font-mono text-xs font-normal text-zinc-800 outline-none"
              />
            </label>

            <button
              type="button"
              onClick={copyToken}
              className="w-fit rounded-lg bg-[#f2d300] px-4 py-2 text-sm font-bold text-[#001f4d]"
            >
              {copied ? "Copied" : "Copy token"}
            </button>
          </section>
        ) : null}
      </div>
    </main>
  );
}
