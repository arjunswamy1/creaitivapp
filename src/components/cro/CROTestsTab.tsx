import { useState, useMemo } from "react";
import { useVertical } from "@/contexts/VerticalContext";
import { useStellarExperiments } from "@/hooks/useStellarExperiments";
import CROSummary from "./CROSummary";
import ExperimentCard from "./ExperimentCard";
import type { StellarStatusFilter, StellarSortOption, StellarExperiment } from "@/types/stellar";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, FlaskConical, ShieldAlert, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function CROTestsTab() {
  const { activeVertical } = useVertical();
  const [statusFilter, setStatusFilter] = useState<StellarStatusFilter>("all");
  const [sortBy, setSortBy] = useState<StellarSortOption>("newest");

  const { data, isLoading, error } = useStellarExperiments(activeVertical.id, statusFilter);

  // Client-side sort
  const sorted = useMemo(() => {
    if (!data?.experiments) return [];
    const exps = [...data.experiments];
    switch (sortBy) {
      case "significance":
        return exps.sort(
          (a, b) => (b.statisticalSignificance ?? 0) - (a.statisticalSignificance ?? 0)
        );
      case "conversion_rate": {
        const bestCR = (e: StellarExperiment) =>
          Math.max(0, ...e.variants.map((v) => v.conversionRate));
        return exps.sort((a, b) => bestCR(b) - bestCR(a));
      }
      default:
        return exps.sort(
          (a, b) =>
            new Date(b.startedAt || b.createdAt || 0).getTime() -
            new Date(a.startedAt || a.createdAt || 0).getTime()
        );
    }
  }, [data?.experiments, sortBy]);

  // Error states
  if (error) {
    const msg = (error as Error).message;
    if (msg === "unauthorized") {
      return (
        <ErrorState
          icon={<ShieldAlert className="w-8 h-8 text-destructive" />}
          title="Unauthorized"
          description="The Stellar API key is missing or invalid. Please check the backend configuration."
        />
      );
    }
    if (msg === "rate_limited") {
      return (
        <ErrorState
          icon={<Clock className="w-8 h-8 text-amber-500" />}
          title="Rate Limited"
          description="Too many requests to the Stellar API. Please wait a moment and try again."
        />
      );
    }
    return (
      <ErrorState
        icon={<AlertCircle className="w-8 h-8 text-destructive" />}
        title="Error Loading Experiments"
        description={msg}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StellarStatusFilter)}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as StellarSortOption)}>
          <SelectTrigger className="w-[180px] h-9 text-sm">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="significance">Highest Significance</SelectItem>
            <SelectItem value="conversion_rate">Highest Conv. Rate</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState vertical={activeVertical.label} />
      ) : (
        <>
          <CROSummary experiments={sorted} lastSynced={data?.lastSynced ?? null} />
          <div className="space-y-4">
            {sorted.map((exp) => (
              <ExperimentCard key={exp.experimentId} experiment={exp} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ErrorState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      {icon}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md">{description}</p>
    </div>
  );
}

function EmptyState({ vertical }: { vertical: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <FlaskConical className="w-8 h-8 text-muted-foreground" />
      <h3 className="text-lg font-semibold text-foreground">No Experiments Found</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        No CRO experiments match the <strong>{vertical}</strong> vertical. Experiments are matched
        by name and URL patterns.
      </p>
    </div>
  );
}
