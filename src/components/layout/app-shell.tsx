import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { getDefaultRouteForRole } from "@/lib/auth/permissions";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getNavigationGroupsForRole } from "@/lib/navigation";
import { AppFrame } from "@/components/layout/app-frame";
import type { AuthUserProfile } from "@/types/auth";

type AppShellProps = {
  children: React.ReactNode;
  profile?: AuthUserProfile;
};

export async function AppShell({ children, profile: initialProfile }: AppShellProps) {
  const profile = initialProfile ?? (await getCurrentUserProfile());
  const navigationGroups = profile
    ? getNavigationGroupsForRole(profile.role)
    : [];
  const homeHref = profile ? getDefaultRouteForRole(profile.role) : "/dashboard";

  return (
    <div className="min-h-screen bg-[#fffdf2] text-zinc-950">
      <header className="border-b border-[#efe6b6] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <Link
              href={homeHref}
              className="text-xl font-black tracking-normal text-[#001f4d]"
            >
              Tytan
            </Link>
            <p className="mt-0.5 text-xs font-semibold uppercase text-zinc-500">
              Teams Tracking Tool
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {profile ? (
              <>
                <div className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] px-3 py-2">
                  <p className="font-bold text-[#001f4d]">
                    {profile.fullName}
                  </p>
                  <p className="text-xs text-zinc-600">{profile.email}</p>
                </div>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-bold text-zinc-700 transition hover:border-[#001f4d] hover:text-[#001f4d]"
                  >
                    Logout
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-bold text-zinc-800 transition hover:border-[#001f4d]"
              >
                Login
              </Link>
            )}
            <Link
              href={homeHref}
              className="rounded-lg bg-[#001f4d] px-3 py-2 font-bold text-white transition hover:bg-[#07336f]"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <AppFrame navigationGroups={navigationGroups}>{children}</AppFrame>
    </div>
  );
}
