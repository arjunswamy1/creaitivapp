import { ArrowUpRight, ArrowDownRight, ArrowRight } from "lucide-react";
import type { TrendIndicators } from "@/hooks/useBillyKPIs";

interface TrendIndicatorProps {
  trends: TrendIndicators;
  invertColor?: boolean;
}

function TrendRow({ label, value, invertColor }: { label: string; value: number | null; invertColor?: boolean }) {
  if (value === null || value === undefined) return null;

  const absVal = Math.abs(value);
  const isFlat = absVal < 1;
  const isPositive = invertColor ? value <= 0 : value >= 0;

  const colorClass = isFlat
    ? "text-muted-foreground"
    : isPositive
      ? "text-accent"
      : "text-destructive";

  const Icon = isFlat ? ArrowRight : value >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className={`inline-flex items-center gap-0.5 ${colorClass}`}>
      <Icon className="w-2.5 h-2.5" />
      <span className="text-[10px] font-mono font-medium">
        {value >= 0 ? "+" : ""}{value.toFixed(1)}%
      </span>
      <span className="text-[9px] text-muted-foreground ml-0.5">{label}</span>
    </div>
  );
}

const TrendIndicator = ({ trends, invertColor }: TrendIndicatorProps) => {
  const hasAny = trends.dod !== null || trends.wow !== null || trends.mom !== null;
  if (!hasAny) return null;

  return (
    <div className="flex flex-col gap-0.5 mt-0.5">
      <TrendRow label="DoD" value={trends.dod} invertColor={invertColor} />
      <TrendRow label="WoW" value={trends.wow} invertColor={invertColor} />
      <TrendRow label="MoM" value={trends.mom} invertColor={invertColor} />
    </div>
  );
};

export default TrendIndicator;
