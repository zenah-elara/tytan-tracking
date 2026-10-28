"use client";

import { useFormStatus } from "react-dom";

export function GoogleChatRetryButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="h-8 rounded-lg border border-[#001f4d]/20 bg-white px-3 text-xs font-black text-[#001f4d] transition hover:bg-[#eef4ff] disabled:cursor-wait disabled:bg-zinc-100 disabled:text-zinc-500"
    >
      {pending ? "Retrying..." : "Retry"}
    </button>
  );
}
