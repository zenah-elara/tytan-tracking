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
      <header className="border-b border-[#cdbf73] bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#001f4d] text-sm font-black text-[#f2d300] shadow-sm">
              TT
            </div>
            <div className="min-w-0">
            <Link
              href={homeHref}
              className="text-xl font-black tracking-normal text-[#001f4d]"
            >
              Tytan Teams
            </Link>
            <p className="mt-0.5 text-xs font-black uppercase tracking-[0.16em] text-[#001f4d]/70">
              Tracking Tool
            </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {profile ? (
              <>
                <div className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] px-3 py-2 shadow-sm">
                  <p className="font-bold text-[#001f4d]">
                    {profile.fullName}
                  </p>
                  <p className="text-xs text-zinc-600">{profile.email}</p>
                </div>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="rounded-lg border border-[#cdbf73] bg-white px-3 py-2 font-bold text-[#001f4d] transition hover:border-[#f2d300] hover:bg-[#fff7bf]"
                  >
                    Logout
                  </button>
                </form>
              </>
            ) : (
              <Link
              href="/login"
                className="rounded-lg border border-[#cdbf73] bg-white px-3 py-2 font-bold text-[#001f4d] transition hover:border-[#f2d300]"
              >
                Login
              </Link>
            )}
            <Link
              href={homeHref}
              className="rounded-lg bg-[#001f4d] px-3 py-2 font-bold text-white shadow-sm transition hover:bg-[#07336f]"
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
