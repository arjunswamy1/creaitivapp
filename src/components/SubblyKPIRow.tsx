import { Package } from "lucide-react";
import KPICard from "@/components/KPICard";
import { useSubblyKPIs } from "@/hooks/useSubblyData";
import { Skeleton } from "@/components/ui/skeleton";

const SubblyKPIRow = () => {
  const { data, isLoading, isError } = useSubblyKPIs();

  if (isError || (!isLoading && !data)) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Package className="w-4 h-4" /> Subscription Metrics
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard
              title="Active Subscriptions"
              value={(data?.activeSubscriptions ?? 0).toLocaleString()}
            />
            <KPICard
              title="Est. MRR"
              value={`$${(data?.mrr ?? 0).toLocaleString()}`}
            />
            <KPICard
              title="Total Revenue"
              value={`$${(data?.totalRevenue ?? 0).toLocaleString()}`}
            />
            <KPICard
              title="Churn Rate"
              value={`${data?.churnRate ?? 0}%`}
              invertColor
            />
          </>
        )}
      </div>
    </div>
  );
};

export default SubblyKPIRow;
