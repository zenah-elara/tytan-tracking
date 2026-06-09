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
    label: "Module",
    value: "Setup",
    detail: "Available",
    tone: "amber",
  },
  {
    label: "Scope",
    value: "Role",
    detail: "Protected",
    tone: "zinc",
  },
  {
    label: "Next",
    value: "Review",
    detail: "Confirm workflow",
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
    <section className="space-y-5">
      <div className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase text-[#f2d300]">{module}</p>
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
