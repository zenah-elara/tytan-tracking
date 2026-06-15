import { logoutAction, updatePasswordAction } from "@/lib/auth/actions";
import { requireRouteAccess } from "@/lib/auth/route-guards";
import { AppShell } from "@/components/layout/app-shell";

type AccountSecurityPageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
};

const successMessages: Record<string, string> = {
  "password-updated": "Password updated. Use the new password next time you sign in.",
};

const errorMessages: Record<string, string> = {
  "missing-password": "Enter and confirm your new password.",
  "password-too-short": "Use at least 8 characters.",
  "password-mismatch": "The password confirmation does not match.",
  "update-failed": "Password could not be updated. Try again or contact an admin.",
};

export default async function AccountSecurityPage({
  searchParams,
}: AccountSecurityPageProps) {
  const params = await searchParams;
  const profile = await requireRouteAccess("/account-security");

  return (
    <AppShell profile={profile}>
      <div className="grid max-w-3xl gap-6">
        <header className="rounded-xl border border-[#cdbf73] bg-white p-5 shadow-sm">
          <div className="h-1 w-20 rounded-full bg-[#f2d300]" />
          <h1 className="mt-4 text-2xl font-black text-[#001f4d]">
            Account Security
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Update your password for your Tytan Teams Tracking Tool account.
          </p>
          <p className="mt-3 rounded-lg bg-[#fff7bf] px-3 py-2 text-sm font-bold text-[#001f4d]">
            Signed in as {profile.email}
          </p>
        </header>

        <StatusMessage success={params.success} error={params.error} />

        <section className="overflow-hidden rounded-xl border border-[#cdbf73] bg-white shadow-sm">
          <div className="bg-[#001f4d] px-5 py-4 text-white">
            <h2 className="font-black">Change password</h2>
          </div>
          <form action={updatePasswordAction} className="grid gap-4 p-5">
            <label className="grid gap-2 text-sm font-bold text-[#001f4d]">
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className={fieldClassName}
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-[#001f4d]">
              Confirm new password
              <input
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                required
                className={fieldClassName}
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button className="h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-black text-[#001f4d] transition hover:bg-[#ffe34d]">
                Update password
              </button>
            </div>
          </form>
        </section>

        <form action={logoutAction}>
          <button className="rounded-lg border border-[#cdbf73] bg-white px-4 py-2 text-sm font-bold text-[#001f4d] transition hover:border-[#f2d300] hover:bg-[#fff7bf]">
            Logout
          </button>
        </form>
      </div>
    </AppShell>
  );
}

const fieldClassName =
  "h-11 w-full min-w-0 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30";

function StatusMessage({ success, error }: { success?: string; error?: string }) {
  const message = success
    ? successMessages[success] ?? "Saved."
    : error
      ? errorMessages[error] ?? "That change could not be saved."
      : null;

  if (!message) return null;

  return (
    <p
      className={`rounded-lg border px-4 py-3 text-sm ${
        error
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {message}
    </p>
  );
}
