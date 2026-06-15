import { MetricCard } from "@/components/dashboard/metric-card";

type PlaceholderPageProps = {
  title: string;
  description: string;
  module: string;
  cards?: {
    label: string;
    value: string;
    detail: string;
    tone?: "emerald" | "amber" | "sky" | "zinc";
  }[];
};

const defaultCards: NonNullable<PlaceholderPageProps["cards"]> = [
  {
    label: "Status",
    value: "Planned",
    detail: "V1 foundation is ready.",
    tone: "amber",
  },
  {
    label: "Access",
    value: "Protected",
    detail: "Role-aware route access is active.",
    tone: "zinc",
  },
  {
    label: "Next step",
    value: "Build",
    detail: "Module workflow comes in a later phase.",
    tone: "emerald",
  },
];

export function PlaceholderPage({
  title,
  description,
  module,
  cards = defaultCards,
}: PlaceholderPageProps) {
  return (
    <section className="min-w-0 space-y-5">
      <div className="rounded-xl border border-[#cdbf73] bg-white p-5 shadow-sm">
        <div className="h-1 w-20 rounded-full bg-[#f2d300]" />
        <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-[#001f4d]/70">{module}</p>
        <h1 className="mt-1 text-2xl font-black tracking-normal text-[#001f4d]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
          {description}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>

      <div className="h-1 rounded-full bg-[#f2d300]" />
    </section>
  );
}
