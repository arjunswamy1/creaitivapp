import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string;
  change: number;
  prefix?: string;
  suffix?: string;
}

const KPICard = ({ title, value, change }: KPICardProps) => {
  const isPositive = change >= 0;

  return (
    <div className="glass-card p-5 flex flex-col gap-2 hover:border-primary/30 transition-colors">
      <span className="text-sm text-muted-foreground font-medium">{title}</span>
      <span className="text-2xl font-bold font-mono tracking-tight">{value}</span>
      <div className="flex items-center gap-1">
        {isPositive ? (
          <ArrowUpRight className="w-4 h-4 text-accent" />
        ) : (
          <ArrowDownRight className="w-4 h-4 text-destructive" />
        )}
        <span className={`text-sm font-medium font-mono ${isPositive ? "text-accent" : "text-destructive"}`}>
          {isPositive ? "+" : ""}{change}%
        </span>
        <span className="text-xs text-muted-foreground ml-1">vs prev period</span>
      </div>
    </div>
  );
};

export default KPICard;
