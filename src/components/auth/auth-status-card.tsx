const authStatusItems = [
  {
    label: "Supabase foundation",
    value: "Added",
  },
  {
    label: "Credentials",
    value: "Local env ready",
  },
  {
    label: "Login",
    value: "Email/password",
  },
  {
    label: "Profiles table",
    value: "Applied",
  },
  {
    label: "Route enforcement",
    value: "Conservative",
  },
];

export function AuthStatusCard() {
  return (
    <section className="rounded-2xl border border-[#efe6b6] bg-white p-5 shadow-[0_18px_48px_rgba(0,31,77,0.09)]">
      <div className="h-1.5 w-16 rounded-full bg-[#f2d300]" />
      <h2 className="mt-4 text-base font-semibold text-[#001f4d]">
        Auth Foundation Status
      </h2>
      <div className="mt-4 grid gap-3">
        {authStatusItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-[#fffdf2] px-3 py-2"
          >
            <span className="text-sm text-zinc-600">{item.label}</span>
            <span className="text-sm font-semibold text-[#001f4d]">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
