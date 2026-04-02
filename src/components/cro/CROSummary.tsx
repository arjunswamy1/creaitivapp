import type { StellarExperiment } from "@/types/stellar";
import { Card, CardContent } from "@/components/ui/card";
import { FlaskConical, CheckCircle, TrendingUp, BarChart3 } from "lucide-react";

interface Props {
  experiments: StellarExperiment[];
  lastSynced: string | null;
}

export default function CROSummary({ experiments, lastSynced }: Props) {
  const active = experiments.filter((e) => e.status === "running").length;
  const completed = experiments.filter((e) => e.status === "completed").length;

  // Highest conversion rate across all variants
  const allVariants = experiments.flatMap((e) => e.variants);
  const highestCR = allVariants.length
    ? Math.max(...allVariants.map((v) => v.conversionRate))
    : 0;

  // Best performing experiment by uplift vs control
  let bestUplift: { name: string; uplift: number } | null = null;
  for (const exp of experiments) {
    const control = exp.variants.find((v) => v.isControl);
    if (!control || control.conversionRate === 0) continue;
    for (const v of exp.variants.filter((v) => !v.isControl)) {
      const uplift = ((v.conversionRate - control.conversionRate) / control.conversionRate) * 100;
      if (!bestUplift || uplift > bestUplift.uplift) {
        bestUplift = { name: exp.experimentName, uplift };
      }
    }
  }

  const items = [
    {
      label: "Active Tests",
      value: active,
      icon: FlaskConical,
      color: "text-emerald-500",
    },
    {
      label: "Completed",
      value: completed,
      icon: CheckCircle,
      color: "text-blue-500",
    },
    {
      label: "Top Conv. Rate",
      value: `${highestCR.toFixed(2)}%`,
      icon: TrendingUp,
      color: "text-amber-500",
    },
    {
      label: "Best Uplift",
      value: bestUplift ? `+${bestUplift.uplift.toFixed(1)}%` : "—",
      subtitle: bestUplift?.name ?? undefined,
      icon: BarChart3,
      color: "text-violet-500",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item) => (
          <Card key={item.label} className="bg-card border-border">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <item.icon className={`w-4 h-4 ${item.color}`} />
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
              <p className="text-xl font-semibold text-foreground">{item.value}</p>
              {item.subtitle && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {lastSynced && (
        <p className="text-xs text-muted-foreground text-right">
          Last synced: {new Date(lastSynced).toLocaleString()}
        </p>
      )}
    </div>
  );
}
