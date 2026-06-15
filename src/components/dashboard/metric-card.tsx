type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  tone?: "emerald" | "amber" | "sky" | "zinc";
};

const toneStyles: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  amber: "border-amber-200 bg-amber-50 text-amber-950",
  sky: "border-sky-200 bg-sky-50 text-sky-950",
  zinc: "border-[#cdbf73] bg-white text-[#001f4d]",
};

export function MetricCard({
  label,
  value,
  detail,
  tone = "zinc",
}: MetricCardProps) {
  return (
    <article className={`rounded-xl border p-4 shadow-sm ${toneStyles[tone]}`}>
      <div className="h-1 w-10 rounded-full bg-[#f2d300]" />
      <p className="mt-3 text-sm font-black uppercase tracking-[0.08em] opacity-80">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-normal">{value}</p>
      <p className="mt-2 text-sm opacity-75">{detail}</p>
    </article>
  );
}
