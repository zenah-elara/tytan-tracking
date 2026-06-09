import { notFound } from "next/navigation";
import { DevSessionTokenClient } from "@/app/dev/session-token/session-token-client";

export default function DevSessionTokenPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <DevSessionTokenClient />;
}
