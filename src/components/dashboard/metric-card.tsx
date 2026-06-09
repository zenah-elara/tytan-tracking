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
  zinc: "border-zinc-200 bg-white text-zinc-950",
};

export function MetricCard({
  label,
  value,
  detail,
  tone = "zinc",
}: MetricCardProps) {
  return (
    <article className={`rounded-lg border p-4 shadow-sm ${toneStyles[tone]}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-normal">{value}</p>
      <p className="mt-2 text-sm opacity-75">{detail}</p>
    </article>
  );
}
