import { LoginForm } from "@/components/auth/login-form";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-[#fffdf2] px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-2xl border border-[#efe6b6] bg-white shadow-[0_24px_80px_rgba(0,31,77,0.16)]">
          <div className="grid lg:grid-cols-[1fr_1fr]">
            <div className="relative min-h-72 overflow-hidden bg-[#001f4d] p-7 text-white sm:p-10 lg:min-h-full">
              <div className="absolute -right-24 top-8 h-56 w-56 rounded-full bg-[#f2d300]" />
              <div className="absolute right-10 top-14 h-16 w-16 rounded-full border-[12px] border-[#fffdf2]/35" />
              <div className="absolute bottom-10 right-12 h-24 w-24 rounded-full bg-white/8" />
              <div className="absolute bottom-0 left-0 h-2 w-full bg-[#f2d300]" />

              <div className="relative flex h-full flex-col justify-between gap-12">
                <div>
                  <p className="w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase text-[#f2d300]">
                    Internal Workforce Portal
                  </p>
                  <h1 className="mt-8 text-6xl font-black tracking-normal text-white sm:text-7xl">
                    Tytan
                  </h1>
                  <p className="mt-5 max-w-sm text-base leading-7 text-white/85 sm:text-lg">
                    Team tracking, attendance, and workforce visibility.
                  </p>
                </div>

                <div className="grid gap-3 text-sm text-white/80">
                  <div className="h-1.5 w-20 rounded-full bg-[#f2d300]" />
                  <p>Tytan Teams Tracking Tool</p>
                </div>
              </div>
            </div>

            <div className="bg-white px-6 py-8 sm:px-8 lg:px-10 lg:py-12">
              <p className="text-sm font-semibold text-[#001f4d]">
                Welcome back
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal text-zinc-950">
                Sign in to continue
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                Use your Tytan Teams account to access your role-based
                workspace.
              </p>

              <LoginForm errorCode={error} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
